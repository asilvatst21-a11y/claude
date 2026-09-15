import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // src/lib/supabase.ts cria o client no import — as análises/validação
    // importam funções puras de módulos que também exportam funções de
    // busca no Supabase, então o client precisa inicializar (nunca é
    // chamado de fato nesses testes, que não tocam rede).
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
