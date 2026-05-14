export interface Usuario {
  id: string
  filial: string
  login: string
  senha: string
  nome: string | null
  admin: boolean
  created_at: string
}

export interface Filial {
  id: string
  nome: string
  created_at: string
}

export interface Matricula {
  id: string
  filial: string
  numero: string
  whatsapp: string
  nome: string | null
  ativo: boolean
  created_at: string
}

export interface Cliente {
  id: string
  filial: string
  codigo: string
  nome: string
  foto_url: string | null
  observacoes: string | null
  created_at: string
}

export interface Vinculo {
  id: string
  matricula_id: string
  cliente_id: string
  data_vinculo: string
  created_at: string
  matricula?: Matricula
  cliente?: Cliente
}

export interface Disparo {
  id: string
  filial: string | null
  matricula_id: string | null
  cliente_id: string | null
  whatsapp: string
  mensagem: string
  status: 'pendente' | 'enviado' | 'erro'
  erro: string | null
  created_at: string
}

export interface LinhaArquivo {
  matricula: string
  cliente: string
  [key: string]: string
}
