import type { Usuario } from '../types'

// Cliente do endpoint api/usuarios (CRUD de usuários no servidor). O acesso
// direto à tabela `usuarios` pela chave anônima foi fechado pelo RLS; tudo
// passa por aqui com o token de sessão emitido no login.
const TOKEN_KEY = 'pdv-critico-token'

async function chamar<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) ?? ''
  let resp: Response
  try {
    resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...params }),
    })
  } catch {
    throw new Error('Falha de conexão. Tente de novo.')
  }
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || json?.erro) {
    throw new Error(json?.erro ?? `Erro ${resp.status}`)
  }
  return json as T
}

export async function listarUsuarios(filtro?: { filial?: string; apenasComCargo?: boolean }): Promise<Usuario[]> {
  const json = await chamar<{ usuarios: Usuario[] }>('list', filtro ?? {})
  return json.usuarios ?? []
}

export interface DadosUsuario {
  filial: string
  login: string
  senha?: string
  nome?: string | null
  admin?: boolean
  cargo?: string | null
  permissoes?: string[] | null
  turno?: string | null
  telefone?: string | null
}

export async function criarUsuario(dados: DadosUsuario): Promise<void> {
  await chamar('create', { ...dados })
}

export async function atualizarUsuario(id: string, dados: Partial<DadosUsuario>): Promise<void> {
  await chamar('update', { id, ...dados })
}

export async function removerUsuario(id: string): Promise<void> {
  await chamar('delete', { id })
}

export async function resetarSenhaUsuario(id: string, senha: string): Promise<void> {
  await chamar('resetSenha', { id, senha })
}

export async function atualizarPermissoesUsuario(id: string, permissoes: string[]): Promise<void> {
  await chamar('updatePermissoes', { id, permissoes })
}
