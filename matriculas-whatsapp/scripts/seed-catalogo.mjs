/**
 * Seed: popula as tabelas `produtos` e `pdvs` no Supabase.
 *
 * Uso (uma única vez):
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE=eyJ... node scripts/seed-catalogo.mjs
 *
 * Ou crie um arquivo .env na raiz do projeto com as variáveis acima e rode:
 *   node --env-file=.env scripts/seed-catalogo.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE ?? process.env.VITE_SUPABASE_SERVICE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE (ou VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_KEY).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function upsert(tabela, rows) {
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(tabela).upsert(rows.slice(i, i + BATCH))
    if (error) {
      console.error(`❌  Erro em ${tabela} (lote ${i}):`, error.message)
      process.exit(1)
    }
    total += Math.min(BATCH, rows.length - i)
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
