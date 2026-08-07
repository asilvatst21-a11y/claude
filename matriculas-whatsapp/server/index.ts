/// <reference types="node" />
// Servidor Express pro Azure App Service — substitui as Serverless Functions
// + o Cron da Vercel (ver vercel.json, mantido só como referência histórica).
// Os handlers em api/*.ts não mudam nada: a assinatura (req, res) já é
// compatível com Express, então cada um vira uma rota sem reescrita.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cron from 'node-cron'

import login from '../api/login.ts'
import usuarios from '../api/usuarios.ts'
import autocompleteEndereco from '../api/autocomplete-endereco.ts'
import calcularKm from '../api/calcular-km.ts'
import consultaPendenciasAudio from '../api/consulta-pendencias-audio.ts'
import reposicaoManual from '../api/reposicao-manual.ts'
import treinamentoGerarFaq from '../api/treinamento-gerar-faq.ts'
import zapiWebhook from '../api/zapi-webhook.ts'
import cronAvisoTurno from '../api/cron-aviso-turno.ts'
import conferenciaParadaCheck from '../api/conferencia-parada-check.ts'
import frotaLeveCheck from '../api/frota-leve-check.ts'
import matinalDuvidasCheck from '../api/matinal-duvidas-check.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const app = express()
app.use(express.json({ limit: '15mb' }))

// Filename → rota, igual ao roteamento por arquivo que a Vercel já fazia.
const rotas: Record<string, (req: any, res: any) => unknown> = {
  '/api/login': login,
  '/api/usuarios': usuarios,
  '/api/autocomplete-endereco': autocompleteEndereco,
  '/api/calcular-km': calcularKm,
  '/api/consulta-pendencias-audio': consultaPendenciasAudio,
  '/api/reposicao-manual': reposicaoManual,
  '/api/treinamento-gerar-faq': treinamentoGerarFaq,
  '/api/zapi-webhook': zapiWebhook,
  '/api/cron-aviso-turno': cronAvisoTurno,
  '/api/conferencia-parada-check': conferenciaParadaCheck,
  '/api/frota-leve-check': frotaLeveCheck,
  '/api/matinal-duvidas-check': matinalDuvidasCheck,
}

for (const [rota, handler] of Object.entries(rotas)) {
  app.all(rota, (req, res) => handler(req, res))
}

// Estático (build do Vite) + fallback de SPA — mesma regra do
// `rewrites` do vercel.json: tudo que não é /api/* cai no index.html.
app.use(express.static(distDir))
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))

// ── Agendamentos ──────────────────────────────────────────────────────────
// Substituem o Cron da Vercel (cron-aviso-turno) e os "-check" que antes
// dependiam de um agendador externo por causa do limite de crons do plano
// Vercel Hobby. Aqui rodam em processo, direto, já que o App Service mantém
// o servidor sempre ligado — sem depender de nenhum serviço de terceiro.
function fakeRes() {
  const res: any = {}
  res.status = () => res
  res.json = () => res
  res.send = () => res
  res.end = () => res
  return res
}

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const ZAPI_WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

cron.schedule('*/5 * * * *', async () => {
  try {
    await cronAvisoTurno({ method: 'GET', headers: { authorization: `Bearer ${CRON_SECRET}` }, query: {} }, fakeRes())
  } catch (e) {
    console.error('[cron] aviso-turno falhou:', e)
  }
})

cron.schedule('*/5 * * * *', async () => {
  try {
    await conferenciaParadaCheck({ method: 'GET', headers: {}, query: { token: ZAPI_WEBHOOK_SECRET } }, fakeRes())
  } catch (e) {
    console.error('[cron] conferencia-parada-check falhou:', e)
  }
})

cron.schedule('*/30 * * * *', async () => {
  try {
    await frotaLeveCheck({ method: 'GET', headers: {}, query: { token: ZAPI_WEBHOOK_SECRET } }, fakeRes())
  } catch (e) {
    console.error('[cron] frota-leve-check falhou:', e)
  }
})

cron.schedule('*/10 * * * *', async () => {
  try {
    await matinalDuvidasCheck({ method: 'GET', headers: {}, query: { token: ZAPI_WEBHOOK_SECRET } }, fakeRes())
  } catch (e) {
    console.error('[cron] matinal-duvidas-check falhou:', e)
  }
})
