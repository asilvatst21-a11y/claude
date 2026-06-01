export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseGsdpq } from '@/lib/parsers/parseGsdpq'
import { parseDtoChecklist } from '@/lib/parsers/parseDtoChecklist'
import { parseProntuario } from '@/lib/parsers/parseProntuario'

type FileType = 'gsdpq' | 'dto_checklist' | 'prontuario_motorista' | 'prontuario_ajudante' | 'unknown'

function detectFileType(filename: string): FileType {
  const upper = filename.toUpperCase()
  if (upper.includes('GSDPQ')) return 'gsdpq'
  if (upper.includes('DTO')) return 'dto_checklist'
  if (upper.includes('PRONTUARIO_MOTORISTA') || upper.includes('PRONTU_RIO_MOTORISTA')) return 'prontuario_motorista'
  if (upper.includes('PRONTUARIO_AJUDANTE') || upper.includes('PRONTU_RIO_AJUDANTE')) return 'prontuario_ajudante'
  return 'unknown'
}

async function findColaborador(supabase: ReturnType<typeof createServiceClient>, name: string): Promise<number | null> {
  // Exact match first
  const { data: exact } = await supabase
    .from('colaboradores')
    .select('id')
    .ilike('nome', name.trim())
    .limit(1)
    .single()

  if (exact) return exact.id

  // Fuzzy: contains
  const { data: fuzzy } = await supabase
    .from('colaboradores')
    .select('id')
    .ilike('nome', `%${name.trim()}%`)
    .limit(1)
    .single()

  return fuzzy ? fuzzy.id : null
}

interface ImportResult {
  filename: string
  tipo: FileType
  total_registros: number
  total_colaboradores_encontrados: number
  itens_no_detectados: number
  errors: string[]
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const periodoRef = formData.get('periodo_ref') as string || new Date().toISOString().slice(0, 7)
    const files = formData.getAll('files[]') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const results: ImportResult[] = []

    for (const file of files) {
      const filename = file.name
      const tipo = detectFileType(filename)
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const result: ImportResult = {
        filename,
        tipo,
        total_registros: 0,
        total_colaboradores_encontrados: 0,
        itens_no_detectados: 0,
        errors: [],
      }

      if (tipo === 'unknown') {
        result.errors.push('Tipo de arquivo não reconhecido')
        results.push(result)
        continue
      }

      try {
        if (tipo === 'gsdpq' || tipo === 'dto_checklist') {
          const parsed = tipo === 'gsdpq' ? parseGsdpq(buffer) : parseDtoChecklist(buffer)
          result.errors.push(...parsed.errors)
          result.total_registros = parsed.records.length

          if (parsed.records.length === 0) {
            results.push(result)
            continue
          }

          // Insert importacao record
          const { data: importacao, error: impErr } = await supabase
            .from('importacoes')
            .insert({
              tipo,
              nome_arquivo: filename,
              periodo_ref: periodoRef,
              total_registros: parsed.records.length,
            })
            .select('id')
            .single()

          if (impErr || !importacao) {
            result.errors.push(`Erro ao criar registro de importação: ${impErr?.message}`)
            results.push(result)
            continue
          }

          let colaboradoresEncontrados = 0
          let itensNoTotal = 0

          for (const rec of parsed.records) {
            const colaboradorId = await findColaborador(supabase, rec.colaborador_nome)
            if (colaboradorId) colaboradoresEncontrados++

            const itensOk = rec.itens.filter(i => i.valor === 'OK').length
            const itensNo = rec.itens.filter(i => i.valor === 'NO').length
            const itensNa = rec.itens.filter(i => i.valor === 'NA').length
            const totalItens = itensOk + itensNo + itensNa
            const percentual = totalItens > 0 ? ((itensOk / (totalItens - itensNa)) * 100) : null

            const { data: registro, error: regErr } = await supabase
              .from('gsdpq_registros')
              .insert({
                importacao_id: importacao.id,
                colaborador_id: colaboradorId,
                colaborador_nome: rec.colaborador_nome,
                matricula: rec.matricula,
                realizado_por: rec.realizado_por,
                tipo: rec.tipo,
                data: rec.data.toISOString().split('T')[0],
                observacoes: rec.observacoes,
                total_itens: totalItens,
                itens_ok: itensOk,
                itens_no: itensNo,
                itens_na: itensNa,
                percentual_conformidade: percentual,
                periodo_ref: periodoRef,
              })
              .select('id')
              .single()

            if (regErr || !registro) {
              result.errors.push(`Erro ao inserir registro ${rec.colaborador_nome}: ${regErr?.message}`)
              continue
            }

            // Insert NO items
            const noItems = rec.itens.filter(i => i.valor === 'NO')
            itensNoTotal += noItems.length

            if (noItems.length > 0) {
              const noRows = noItems.map(item => ({
                registro_id: registro.id,
                colaborador_id: colaboradorId,
                colaborador_nome: rec.colaborador_nome,
                item_nome: item.nome,
                data: rec.data.toISOString().split('T')[0],
                periodo_ref: periodoRef,
              }))

              const { error: noErr } = await supabase.from('gsdpq_itens_no').insert(noRows)
              if (noErr) result.errors.push(`Erro ao inserir itens NO: ${noErr.message}`)
            }
          }

          result.total_colaboradores_encontrados = colaboradoresEncontrados
          result.itens_no_detectados = itensNoTotal

          // Update importacao totals
          await supabase
            .from('importacoes')
            .update({ total_colaboradores_encontrados: colaboradoresEncontrados })
            .eq('id', importacao.id)

        } else {
          // Prontuario
          const parsed = parseProntuario(buffer)
          result.errors.push(...parsed.errors)
          result.total_registros = parsed.records.length

          if (parsed.records.length === 0) {
            results.push(result)
            continue
          }

          const { data: importacao, error: impErr } = await supabase
            .from('importacoes')
            .insert({
              tipo,
              nome_arquivo: filename,
              periodo_ref: periodoRef,
              total_registros: parsed.records.length,
            })
            .select('id')
            .single()

          if (impErr || !importacao) {
            result.errors.push(`Erro ao criar registro de importação: ${impErr?.message}`)
            results.push(result)
            continue
          }

          let colaboradoresEncontrados = 0

          for (const rec of parsed.records) {
            const colaboradorId = await findColaborador(supabase, rec.nome)
            if (colaboradorId) colaboradoresEncontrados++

            const { error: scoreErr } = await supabase.from('prontuario_scores').insert({
              importacao_id: importacao.id,
              colaborador_id: colaboradorId,
              nome: rec.nome,
              cpf: rec.cpf,
              cargo: rec.cargo,
              situacao_empregado: rec.situacao_empregado,
              status_liberacao: rec.status_liberacao,
              motivo_bloqueio: rec.motivo_bloqueio,
              pontuacao_ponderada: rec.pontuacao_ponderada,
              faixa: rec.faixa,
              acidentes: rec.acidentes,
              colisoes: rec.colisoes,
              desvios_monitoramentos: rec.desvios_monitoramentos,
              fadigas: rec.fadigas,
              multas: rec.multas,
              sancoes_disciplinares: rec.sancoes_disciplinares,
              telemetria_pontuacao: rec.telemetria_pontuacao,
              periodo_ref: periodoRef,
            })

            if (scoreErr) {
              result.errors.push(`Erro ao inserir prontuário ${rec.nome}: ${scoreErr.message}`)
            }
          }

          result.total_colaboradores_encontrados = colaboradoresEncontrados

          await supabase
            .from('importacoes')
            .update({ total_colaboradores_encontrados: colaboradoresEncontrados })
            .eq('id', importacao.id)
        }
      } catch (err) {
        result.errors.push(`Erro inesperado: ${err instanceof Error ? err.message : String(err)}`)
      }

      results.push(result)
    }

    return NextResponse.json({ importacoes: results })
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao processar requisição: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('importacoes')
      .select('*')
      .order('importado_em', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ importacoes: data })
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao buscar importações: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
