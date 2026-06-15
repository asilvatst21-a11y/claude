/**
 * Seed: popula as tabelas `produtos` e `pdvs` no Supabase via REST API.
 *
 * Uso:
 *   node --env-file=.env scripts/seed-catalogo.mjs
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '').replace(/\/rest\/v1$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE ?? process.env.VITE_SUPABASE_SERVICE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE (ou VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_KEY).')
  process.exit(1)
}

const BASE = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
}

async function upsert(tabela, rows) {
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const res = await fetch(`${BASE}/${tabela}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error(`\n❌  Erro em ${tabela} (lote ${i}): ${res.status} ${txt}`)
      process.exit(1)
    }
    total += chunk.length
    process.stdout.write(`\r   ${tabela}: ${total}/${rows.length}`)
  }
  console.log(`\r   ✅ ${tabela}: ${total} registros inseridos/atualizados`)
}

const produtos = JSON.parse(readFileSync(join(__dir, 'data-produtos.json'), 'utf8'))
const pdvs     = JSON.parse(readFileSync(join(__dir, 'data-pdvs.json'),     'utf8'))

console.log(`\n🌱  Seed do catálogo Ambev → ${SUPABASE_URL}\n`)
await upsert('produtos', produtos)
await upsert('pdvs',     pdvs)
console.log('\n✅  Concluído!')
