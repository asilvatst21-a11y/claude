/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import { promisify } from 'node:util'

// Login validado no servidor. A senha é comparada aqui (nunca volta ao
// cliente) e, se ainda estiver em texto puro no banco, é convertida para
// hash scrypt de forma transparente no primeiro login bem-sucedido.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const scryptAsync = promisify(scrypt)

const HASH_PREFIX = 'scrypt$'
const SESSAO_HORAS = 12

function ehHash(v: string): boolean {
  return v.startsWith(HASH_PREFIX)
}

async function gerarHash(senha: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivada = (await scryptAsync(senha, salt, 64)) as Buffer
  return `${HASH_PREFIX}${salt}$${derivada.toString('hex')}`
}

async function conferirSenha(senha: string, armazenada: string): Promise<boolean> {
  if (ehHash(armazenada)) {
    const partes = armazenada.split('$') // ['scrypt', salt, hash]
    const salt = partes[1]
    const hash = partes[2]
    if (!salt || !hash) return false
    const derivada = (await scryptAsync(senha, salt, 64)) as Buffer
    const alvo = Buffer.from(hash, 'hex')
    return alvo.length === derivada.length && timingSafeEqual(alvo, derivada)
  }
  // Legado: senha em texto puro. Comparação simples (será migrada para hash).
  return senha === armazenada
}

// Token de sessão assinado (HMAC). Usado na Fase B para proteger endpoints
// administrativos; nesta fase já vai gravado para não precisar relogar depois.
function criarToken(payload: Record<string, unknown>): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const assinatura = createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url')
  return `${corpo}.${assinatura}`
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ sucesso: false, erro: 'method' })
    return
  }
  if (!SESSION_SECRET) {
    console.error('SESSION_SECRET não configurado — login recusado.')
    res.status(503).json({ sucesso: false, erro: 'Configuração de sessão ausente.' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const filial = String(body.filial ?? '').trim()
  const login = String(body.login ?? '').trim()
  const senha = String(body.senha ?? '')
  if (!filial || !login || !senha) {
    res.status(400).json({ sucesso: false, erro: 'Informe filial, usuário e senha.' })
    return
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, filial, login, senha, nome, admin, permissoes, cargo, created_at')
    .eq('filial', filial)
    .eq('login', login)
    .maybeSingle()

  if (error) {
    console.error('login: erro no supabase:', error.message)
    res.status(500).json({ sucesso: false, erro: 'Erro ao validar. Tente de novo.' })
    return
  }
  // Mesma mensagem genérica para usuário inexistente ou senha errada.
  if (!data) {
    res.status(200).json({ sucesso: false, erro: 'Usuário, senha ou filial inválidos' })
    return
  }

  const armazenada = String(data.senha ?? '')
  const ok = await conferirSenha(senha, armazenada)
  if (!ok) {
    res.status(200).json({ sucesso: false, erro: 'Usuário, senha ou filial inválidos' })
    return
  }

  // Upgrade transparente para hash quando a senha ainda está em texto puro.
  if (!ehHash(armazenada)) {
    try {
      const nova = await gerarHash(senha)
      await supabase.from('usuarios').update({ senha: nova }).eq('id', data.id)
    } catch (e) {
      console.error('login: falha ao migrar senha para hash (login segue):', e)
    }
  }

  const { senha: _s, ...usuario } = data
  const token = criarToken({ id: data.id, admin: !!data.admin, exp: Date.now() + SESSAO_HORAS * 3600 * 1000 })
  res.status(200).json({ sucesso: true, usuario, token })
}
