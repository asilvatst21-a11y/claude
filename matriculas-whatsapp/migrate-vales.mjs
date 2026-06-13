/**
 * Migração de dados do Supabase antigo (vales-log20) para o PDV Crítico.
 *
 * Como usar:
 *   ORIGEM_URL="https://xxxx.supabase.co" \
 *   ORIGEM_KEY="service_role_key_antiga" \
 *   DESTINO_URL="https://yyyy.supabase.co" \
 *   DESTINO_KEY="service_role_key_nova" \
 *   node migrate-vales.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { WebSocket } from 'ws'

const ORIGEM_URL = process.env.ORIGEM_URL
const ORIGEM_KEY = process.env.ORIGEM_KEY
const DESTINO_URL = process.env.DESTINO_URL
const DESTINO_KEY = process.env.DESTINO_KEY

if (!ORIGEM_URL || !ORIGEM_KEY || !DESTINO_URL || !DESTINO_KEY) {
  console.error(`
Variáveis de ambiente ausentes. Defina:
  ORIGEM_URL   → URL do Supabase antigo (vales-log20)
  ORIGEM_KEY   → service_role key do Supabase antigo
  DESTINO_URL  → URL do Supabase novo (PDV Crítico)
  DESTINO_KEY  → service_role key do Supabase novo
`)
  process.exit(1)
}

const wsOpts = { realtime: { transport: WebSocket } }
const origem  = createClient(ORIGEM_URL,  ORIGEM_KEY,  { auth: { persistSession: false }, ...wsOpts })
const destino = createClient(DESTINO_URL, DESTINO_KEY, { auth: { persistSession: false }, ...wsOpts })

// Ordem respeitando chaves estrangeiras
const TABELAS = [
  { nome: 'ajudantes',      conflito: 'id' },
  { nome: 'importacoes',    conflito: 'id' },
  { nome: 'vales',          conflito: 'id' },
  { nome: 'vale_itens',     conflito: 'id' },
  { nome: 'vale_ajudantes', conflito: 'id' },
  { nome: 'vale_notas',     conflito: 'id' },
  { nome: 'notificacoes',   conflito: 'id' },
  { nome: 'reposicoes',     conflito: 'id' },
  { nome: 'configuracoes',  conflito: 'chave' },
]

async function buscarTodos(tabela) {
  const PAGE = 1000
  let offset = 0
  let todos = []

  while (true) {
    const { data, error } = await origem
      .from(tabela)
      .select('*')
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`Erro lendo ${tabela}: ${error.message}`)
    if (!data || data.length === 0) break

    todos = todos.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  return todos
}

async function migrarTabela({ nome, conflito }) {
  process.stdout.write(`  ${nome.padEnd(20)} → lendo...`)

  let linhas
  try {
    linhas = await buscarTodos(nome)
  } catch (e) {
    console.log(` SKIP (tabela não existe na origem)`)
    return { nome, ok: 0, skip: true }
  }

  if (linhas.length === 0) {
    console.log(` vazia, nada a migrar`)
    return { nome, ok: 0 }
  }

  process.stdout.write(` ${linhas.length} linhas → gravando...`)

  // Inserir em lotes de 500
  const LOTE = 500
  let inseridos = 0

  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE)
    const { error } = await destino
      .from(nome)
      .upsert(lote, { onConflict: conflito, ignoreDuplicates: false })

    if (error) throw new Error(`Erro gravando ${nome} (lote ${i / LOTE + 1}): ${error.message}`)
    inseridos += lote.length
  }

  console.log(` OK (${inseridos} upserted)`)
  return { nome, ok: inseridos }
}

async function main() {
  console.log('\n🚀  Iniciando migração vales-log20 → PDV Crítico\n')
  console.log(`  Origem : ${ORIGEM_URL}`)
  console.log(`  Destino: ${DESTINO_URL}\n`)

  // Verificar conexão com origem
  const { error: pingErr } = await origem.from('ajudantes').select('id').limit(1)
  if (pingErr && pingErr.code !== 'PGRST116') {
    console.error('Não foi possível conectar na origem:', pingErr.message)
    process.exit(1)
  }

  const resultados = []

  for (const tabela of TABELAS) {
    try {
      const r = await migrarTabela(tabela)
      resultados.push(r)
    } catch (e) {
      console.log(` ERRO`)
      console.error(`    ${e.message}`)
      resultados.push({ nome: tabela.nome, ok: 0, erro: e.message })
    }
  }

  console.log('\n────────────────────────────────────')
  console.log('  Resumo da migração:')
  for (const r of resultados) {
    if (r.skip)        console.log(`  ✗  ${r.nome.padEnd(20)} não existe na origem`)
    else if (r.erro)   console.log(`  ✗  ${r.nome.padEnd(20)} ERRO: ${r.erro}`)
    else if (r.ok > 0) console.log(`  ✓  ${r.nome.padEnd(20)} ${r.ok} registros`)
    else               console.log(`  –  ${r.nome.padEnd(20)} vazia`)
  }

  const total = resultados.reduce((s, r) => s + (r.ok ?? 0), 0)
  console.log(`\n  Total migrado: ${total} registros`)
  console.log('────────────────────────────────────\n')
}

main().catch(e => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
