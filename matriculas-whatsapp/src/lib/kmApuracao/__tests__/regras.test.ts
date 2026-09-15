import { describe, it, expect } from 'vitest'
import { calcularKmConsiderado, paramVigenteNaData, type EntradaCalculoKm } from '../regras'

function entrada(parcial: Partial<EntradaCalculoKm>): EntradaCalculoKm {
  return {
    kmRoteirizador: 100, kmTelemetria: 90, kmMaximo: 200, aderencia: 0.9,
    mapaVirado: false, temCarregamentoRoteirizador: false, temCarregamentoTelemetria: false,
    entradaValida: true,
    ...parcial,
  }
}

describe('calcularKmConsiderado — uma viagem por regra', () => {
  it('regra 0 — entrada inválida (erro de dado) usa o menor entre roteirizador e máximo', () => {
    const r = calcularKmConsiderado(entrada({ entradaValida: false, kmRoteirizador: 150, kmMaximo: 100 }))
    expect(r.regraAplicada).toBe('0_erro_dado')
    expect(r.kmConsiderado).toBe(100)
  })

  it('regra 0 — sem roteirizador válido também, cai para 0', () => {
    const r = calcularKmConsiderado(entrada({ entradaValida: false, kmRoteirizador: null, kmMaximo: null }))
    expect(r.regraAplicada).toBe('0_erro_dado')
    expect(r.kmConsiderado).toBe(0)
  })

  it('regra 1 — sem KM do roteirizador (ausente) vira 0', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: null }))
    expect(r.regraAplicada).toBe('1_sem_roteirizador')
    expect(r.kmConsiderado).toBe(0)
  })

  it('regra 1 — KM do roteirizador <= 0 também vira 0', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 0 }))
    expect(r.regraAplicada).toBe('1_sem_roteirizador')
    expect(r.kmConsiderado).toBe(0)
  })

  it('regra 2 — mapa virado faz média 50/50, SEM limitar à telemetria', () => {
    const r = calcularKmConsiderado(entrada({
      mapaVirado: true, temCarregamentoRoteirizador: true, temCarregamentoTelemetria: true,
      kmRoteirizador: 13.99, kmTelemetria: 0,
    }))
    expect(r.regraAplicada).toBe('2_mapa_virado')
    expect(r.kmConsiderado).toBeCloseTo(6.995, 4) // 0.5*0 + 0.5*13.99 — validado com dado real
  })

  it('regra 2 — mapa virado exige os dois carregamentos presentes, senão cai adiante', () => {
    const r = calcularKmConsiderado(entrada({
      mapaVirado: true, temCarregamentoRoteirizador: true, temCarregamentoTelemetria: false,
      kmTelemetria: 90,
    }))
    expect(r.regraAplicada).not.toBe('2_mapa_virado')
  })

  it('regra 3 — sem KM de telemetria usa o menor entre roteirizador e máximo', () => {
    const r = calcularKmConsiderado(entrada({ kmTelemetria: null, kmRoteirizador: 120, kmMaximo: 80 }))
    expect(r.regraAplicada).toBe('3_sem_telemetria')
    expect(r.kmConsiderado).toBe(80)
  })

  it('regra 3 — KM de telemetria zero também entra aqui', () => {
    const r = calcularKmConsiderado(entrada({ kmTelemetria: 0, kmRoteirizador: 50, kmMaximo: 200 }))
    expect(r.regraAplicada).toBe('3_sem_telemetria')
    expect(r.kmConsiderado).toBe(50)
  })

  it('regra 3 — sem KM Máximo cadastrado, usa o roteirizador puro', () => {
    const r = calcularKmConsiderado(entrada({ kmTelemetria: null, kmRoteirizador: 120, kmMaximo: null }))
    expect(r.kmConsiderado).toBe(120)
  })

  it('regra 4 — telemetria acima do máximo usa o máximo', () => {
    const r = calcularKmConsiderado(entrada({ kmTelemetria: 250, kmRoteirizador: 100, kmMaximo: 200 }))
    expect(r.regraAplicada).toBe('4_telemetria_acima_maximo')
    expect(r.kmConsiderado).toBe(200)
    expect(r.tetoAplicado).toBe(false) // já é o próprio valor do teto, não precisa "aplicar" de novo
  })

  it('regra 5 — aderência abaixo do limite faz média 50/50 LIMITADA à telemetria', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 6.2, kmTelemetria: 4.4, aderencia: 0, kmMaximo: 213.72 }))
    expect(r.regraAplicada).toBe('5_aderencia_baixa')
    // média simples seria 5.3, mas o real (validado em 1.606 viagens) é o
    // próprio KM Telemetria, porque é o menor dos dois
    expect(r.kmConsiderado).toBe(4.4)
  })

  it('regra 5 — aderência ausente é tratada como 0 (cai aqui)', () => {
    const r = calcularKmConsiderado(entrada({ aderencia: null, kmRoteirizador: 5.29, kmTelemetria: 8.465, kmMaximo: 999 }))
    expect(r.regraAplicada).toBe('5_aderencia_baixa')
    expect(r.kmConsiderado).toBeCloseTo(6.8775, 4) // 0.5*8.465+0.5*5.29 = 6.8775, menor que a telemetria
  })

  it('regra 6 — aderência ponderada, limitada à telemetria', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 100, kmTelemetria: 90, aderencia: 0.8, kmMaximo: 999 }))
    expect(r.regraAplicada).toBe('6_aderencia_ponderada')
    // bruto = 90*0.8 + 100*0.2 = 92, mas é limitado à telemetria (90)
    expect(r.kmConsiderado).toBe(90)
  })

  it('regra 6 — aderência > 100% continua tratada normalmente (não é erro de dado)', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 50, kmTelemetria: 60, aderencia: 1.3, kmMaximo: 999, entradaValida: true }))
    expect(r.regraAplicada).toBe('6_aderencia_ponderada')
    expect(r.kmConsiderado).toBeLessThanOrEqual(60) // sempre limitado à telemetria, mesmo com aderência > 1
  })
})

describe('teto final (KM Máximo)', () => {
  it('é aplicado depois de qualquer regra, e fica registrado', () => {
    const r = calcularKmConsiderado(entrada({
      mapaVirado: true, temCarregamentoRoteirizador: true, temCarregamentoTelemetria: true,
      kmRoteirizador: 300, kmTelemetria: 300, kmMaximo: 100,
    }))
    expect(r.regraAplicada).toBe('2_mapa_virado')
    expect(r.kmConsiderado).toBe(100)
    expect(r.tetoAplicado).toBe(true)
  })

  it('não aplica teto quando o resultado já está dentro do limite', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 50, kmTelemetria: 45, aderencia: 0.9, kmMaximo: 200 }))
    expect(r.tetoAplicado).toBe(false)
  })

  it('KM Máximo <= 0 é tratado como ausente (não vira teto)', () => {
    const r = calcularKmConsiderado(entrada({ kmTelemetria: null, kmRoteirizador: 120, kmMaximo: 0 }))
    expect(r.kmConsiderado).toBe(120)
    expect(r.tetoAplicado).toBe(false)
  })
})

describe('delta e delta %', () => {
  it('calcula delta e delta % em relação ao roteirizador', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: 100, kmTelemetria: 90, aderencia: 0.9, kmMaximo: 999 }))
    expect(r.deltaKm).toBeCloseTo(r.kmConsiderado - 100, 6)
    expect(r.deltaPct).toBeCloseTo(r.deltaKm! / 100, 6)
  })

  it('delta fica nulo quando não há roteirizador (regra 1)', () => {
    const r = calcularKmConsiderado(entrada({ kmRoteirizador: null }))
    expect(r.deltaKm).toBeNull()
    expect(r.deltaPct).toBeNull()
  })
})

describe('paramVigenteNaData', () => {
  const candidatos = [
    { vigenteAPartir: '2026-01-01', valor: 'a' },
    { vigenteAPartir: '2026-06-01', valor: 'b' },
    { vigenteAPartir: '2026-08-15', valor: 'c' },
  ]

  it('pega o mais recente cuja vigência é <= a data pedida', () => {
    expect(paramVigenteNaData(candidatos, '2026-08-20')?.valor).toBe('c')
    expect(paramVigenteNaData(candidatos, '2026-07-01')?.valor).toBe('b')
    expect(paramVigenteNaData(candidatos, '2026-01-01')?.valor).toBe('a')
  })

  it('não retorna nada se a data pedida é anterior a toda vigência', () => {
    expect(paramVigenteNaData(candidatos, '2025-12-31')).toBeUndefined()
  })

  it('reapurar um mês passado usa o teto que estava vigente NAQUELA data, não o atual', () => {
    // Este é o ponto (b) que o usuário pediu pra validar: sem vigência por
    // data, atualizar o KM Máximo hoje mudaria o resultado de meses já
    // fechados — com vigência, a apuração de um mês passado é estável.
    const kmMaxHistorico = [
      { vigenteAPartir: '2026-01-01', kmMaximo: 100 },
      { vigenteAPartir: '2026-09-01', kmMaximo: 150 }, // atualizado depois
    ]
    expect(paramVigenteNaData(kmMaxHistorico, '2026-08-10')?.kmMaximo).toBe(100)
    expect(paramVigenteNaData(kmMaxHistorico, '2026-09-10')?.kmMaximo).toBe(150)
  })
})
