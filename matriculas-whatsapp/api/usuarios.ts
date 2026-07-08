/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import { scrypt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// CRUD de usuários no servidor, protegido por token de sessão. Substitui o
// acesso direto à tabela `usuarios` pela chave anônima (que fica fechada pelo
// RLS após a migração supabase-fechar-usuarios.sql). Usa a service_role.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const scryptAsync = promisify(scrypt)
const HASH_PREFIX = 'scrypt$'

async function gerarHash(senha: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivada = (await scryptAsync(senha, salt, 64)) as Buffer
  return `${HASH_PREFIX}${salt}$${derivada.toString('hex')}`
}

interface Sessao {
  id: string
}

// Valida o token assinado (HMAC) emitido pelo api/login e confere o vencimento.
function verificarToken(token: string): Sessao | null {
  if (!token || !SESSION_SECRET) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [corpo, assinatura] = partes
  const esperada = createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url')
  const a = Buffer.from(assinatura)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null
    if (!payload.id) return null
    return { id: String(payload.id) }
  } catch {
    return null
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}

const CAMPOS = 'id, filial, login, nome, admin, permissoes, cargo, created_at'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'method' }); return }
  if (!SESSION_SECRET) { res.status(503).json({ erro: 'Configuração de sessão ausente.' }); return }

  // Token via header Authorization: Bearer <token> (ou no corpo).
  const auth = String(req.headers?.authorization ?? '')
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(body.token ?? '')
  const sessao = verificarToken(token)
  if (!sessao) { res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre de novo.' }); return }

  // Carrega o autor pela id do token (fonte de verdade: banco, não o payload).
  const { data: autor } = await supabase
    .from('usuarios').select('id, admin, filial, cargo').eq('id', sessao.id).maybeSingle()
  if (!autor) { res.status(401).json({ erro: 'Usuário da sessão não encontrado.' }); return }
  const ehAdmin = autor.admin === true

  const action = String(body.action ?? '')

  try {
    // ── Listar ──────────────────────────────────────────────────────────
    if (action === 'list') {
      let q = supabase.from('usuarios').select(CAMPOS).order('filial').order('login')
      if (ehAdmin) {
        if (body.filial) q = q.eq('filial', String(body.filial))
        if (body.apenasComCargo) q = q.not('cargo', 'is', null)
      } else {
        // Não-admin (supervisor): só enxerga operadores da própria filial.
        q = q.eq('filial', autor.filial).not('cargo', 'is', null)
      }
      const { data, error } = await q
      if (error) throw new Error(error.message)
      res.status(200).json({ usuarios: data ?? [] })
      return
    }

    // ── Criar ───────────────────────────────────────────────────────────
    if (action === 'create') {
      const querAdmin = body.admin === true
      const cargo = body.cargo ? String(body.cargo) : null
      const filial = String(body.filial ?? '')
      if (!ehAdmin) {
        // Supervisor só cria operador (com cargo) na própria filial, nunca admin.
        if (querAdmin || !cargo || filial !== autor.filial) {
          res.status(403).json({ erro: 'Sem permissão para este cadastro.' }); return
        }
      }
      const login = String(body.login ?? '').trim()
      const senha = String(body.senha ?? '')
      if (!filial || !login || !senha) { res.status(400).json({ erro: 'Informe filial, login e senha.' }); return }
      const insert = {
        filial, login,
        senha: await gerarHash(senha),
        nome: body.nome ? String(body.nome) : null,
        admin: querAdmin,
        cargo,
        permissoes: Array.isArray(body.permissoes) ? body.permissoes : (cargo ? [] : null),
      }
      const { error } = await supabase.from('usuarios').insert(insert)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    // ── Atualizar ───────────────────────────────────────────────────────
    if (action === 'update') {
      const id = String(body.id ?? '')
      if (!id) { res.status(400).json({ erro: 'id ausente.' }); return }
      const { data: alvo } = await supabase.from('usuarios').select('id, filial, cargo, admin').eq('id', id).maybeSingle()
      if (!alvo) { res.status(404).json({ erro: 'Usuário não encontrado.' }); return }

      if (!ehAdmin) {
        // Supervisor: só mexe em operador da própria filial e não pode promover a admin.
        const alvoOperadorMinhaFilial = alvo.cargo != null && alvo.filial === autor.filial
        if (!alvoOperadorMinhaFilial || body.admin === true) {
          res.status(403).json({ erro: 'Sem permissão para editar este usuário.' }); return
        }
      }

      const payload: Record<string, unknown> = {}
      if (body.filial !== undefined) payload.filial = String(body.filial)
      if (body.login !== undefined) payload.login = String(body.login).trim()
      if (body.nome !== undefined) payload.nome = body.nome ? String(body.nome) : null
      if (body.cargo !== undefined) payload.cargo = body.cargo ? String(body.cargo) : null
      if (body.admin !== undefined && ehAdmin) payload.admin = body.admin === true
      if (body.permissoes !== undefined && ehAdmin) payload.permissoes = body.permissoes
      if (body.senha) payload.senha = await gerarHash(String(body.senha))

      const { error } = await supabase.from('usuarios').update(payload).eq('id', id)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    // ── Permissões (só admin) ───────────────────────────────────────────
    if (action === 'updatePermissoes') {
      if (!ehAdmin) { res.status(403).json({ erro: 'Apenas administradores.' }); return }
      const id = String(body.id ?? '')
      if (!id) { res.status(400).json({ erro: 'id ausente.' }); return }
      const { error } = await supabase.from('usuarios').update({ permissoes: body.permissoes }).eq('id', id)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    // ── Resetar senha ───────────────────────────────────────────────────
    if (action === 'resetSenha') {
      const id = String(body.id ?? '')
      const senha = String(body.senha ?? '')
      if (!id || !senha) { res.status(400).json({ erro: 'id e senha são obrigatórios.' }); return }
      const { data: alvo } = await supabase.from('usuarios').select('id, filial, cargo').eq('id', id).maybeSingle()
      if (!alvo) { res.status(404).json({ erro: 'Usuário não encontrado.' }); return }
      if (!ehAdmin && !(alvo.cargo != null && alvo.filial === autor.filial)) {
        res.status(403).json({ erro: 'Sem permissão.' }); return
      }
      const { error } = await supabase.from('usuarios').update({ senha: await gerarHash(senha) }).eq('id', id)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    // ── Excluir ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const id = String(body.id ?? '')
      if (!id) { res.status(400).json({ erro: 'id ausente.' }); return }
      if (id === autor.id) { res.status(400).json({ erro: 'Você não pode excluir o próprio usuário.' }); return }
      const { data: alvo } = await supabase.from('usuarios').select('id, filial, cargo').eq('id', id).maybeSingle()
      if (!alvo) { res.status(404).json({ erro: 'Usuário não encontrado.' }); return }
      if (!ehAdmin && !(alvo.cargo != null && alvo.filial === autor.filial)) {
        res.status(403).json({ erro: 'Sem permissão.' }); return
      }
      const { error } = await supabase.from('usuarios').delete().eq('id', id)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    res.status(400).json({ erro: 'Ação desconhecida.' })
  } catch (e) {
    console.error('usuarios: erro', e)
    res.status(500).json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' })
  }
}
