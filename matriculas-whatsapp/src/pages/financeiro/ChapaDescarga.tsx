import { useEffect, useState } from 'react'
import { Truck, Package, AlertTriangle, CheckCircle2, Printer, X, Upload, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  clientesComMapaHoje, listarLancamentosDoDia, registrarLancamento, calcularChapa, calcularDescarga, buscarMotoristaPlaca, buscarValorNotaCora,
  type ClienteComMapaHoje, type ClienteChapaDescarga, type LancamentoChapaDescarga, type TipoLancamento,
} from '@/lib/chapaDescarga'
import { formatarBRL } from '@/lib/variavelArmazem'

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatarDataBR(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano.slice(2)}`
}

type PassoWizard = 'mapa' | 'tipo' | 'valor' | 'confirmacao'

interface WizardState {
  cliente: ClienteChapaDescarga
  mapas: string[]
  mapaSelecionado: string | null
  tipo: TipoLancamento | null
  valorNota: string
  quantidadePallets: string
  quantidadePagaManual: string
  comprovanteFile: File | null
  motorista: string
  placa: string
  buscandoTransportador: boolean
  valorNotaOrigemCora: boolean
  buscandoValorNota: boolean
}

export default function ChapaDescargaPage() {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [clientes, setClientes] = useState<ClienteComMapaHoje[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoChapaDescarga[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [passo, setPasso] = useState<PassoWizard>('mapa')
  const [salvando, setSalvando] = useState(false)
  const [confirmarFora, setConfirmarFora] = useState(false)
  const [recibo, setRecibo] = useState<LancamentoChapaDescarga | null>(null)

  async function carregar() {
    if (!usuario?.filial) return
    setCarregando(true)
    setErro(null)
    try {
      const [cs, ls] = await Promise.all([clientesComMapaHoje(usuario.filial, data), listarLancamentosDoDia(data)])
      setClientes(cs)
      setLancamentos(ls)
    } catch (e) {
      setErro(String(e))
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [data, usuario?.filial])

  // Assim que o mapa é conhecido (direto, ou após a seleção no passo "mapa"),
  // busca automaticamente motorista e placa que rodaram aquele mapa na Base
  // do Mapa (mesmo import de Financeiro > Catálogo/Vendas). Se a Base ainda
  // não foi importada, os campos ficam em branco para digitação manual.
  useEffect(() => {
    if (!wizard?.mapaSelecionado || !usuario?.filial) return
    let cancelado = false
    setWizard(w => w && ({ ...w, buscandoTransportador: true }))
    buscarMotoristaPlaca(usuario.filial, wizard.mapaSelecionado).then(({ motorista, placa }) => {
      if (cancelado) return
      setWizard(w => w && ({ ...w, motorista: motorista ?? '', placa: placa ?? '', buscandoTransportador: false }))
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard?.mapaSelecionado])

  // Pré-preenche o valor da nota a partir do CORA (mesmo import usado no
  // Farol de Mercados e PDVs Críticos), assim que o wizard abre pro
  // cliente. Continua editável — se o financeiro digitar por cima, o
  // "puxado do CORA" some.
  useEffect(() => {
    if (!wizard?.cliente || !usuario?.filial) return
    let cancelado = false
    setWizard(w => w && ({ ...w, buscandoValorNota: true }))
    buscarValorNotaCora(usuario.filial, data, wizard.cliente.codigo).then(valor => {
      if (cancelado) return
      setWizard(w => {
        if (!w) return w
        if (valor == null) return { ...w, buscandoValorNota: false }
        return { ...w, valorNota: String(valor), valorNotaOrigemCora: true, buscandoValorNota: false }
      })
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard?.cliente.codigo])

  function iniciarLancamento(item: ClienteComMapaHoje) {
    setWizard({
      cliente: item.cliente,
      mapas: item.mapas,
      mapaSelecionado: item.mapas.length === 1 ? item.mapas[0] : null,
      tipo: null,
      valorNota: '',
      quantidadePallets: '',
      quantidadePagaManual: '',
      comprovanteFile: null,
      motorista: '',
      placa: '',
      buscandoTransportador: false,
      valorNotaOrigemCora: false,
      buscandoValorNota: false,
    })
    setPasso(item.mapas.length > 1 ? 'mapa' : 'tipo')
    setConfirmarFora(false)
  }

  function fecharWizard() {
    setWizard(null)
    setPasso('mapa')
    setConfirmarFora(false)
  }

  function calculoAtual() {
    if (!wizard?.tipo) return null
    const { cliente, tipo, valorNota, quantidadePallets } = wizard
    if (tipo === 'chapa') {
      const valor = parseFloat(valorNota.replace(',', '.'))
      if (!Number.isFinite(valor) || valor <= 0) return null
      return calcularChapa(valor, cliente.chapa_valor_a_cada_nota, cliente.chapa_valor_por_chapa)
    }
    const qtd = parseInt(quantidadePallets)
    if (!Number.isFinite(qtd) || qtd <= 0) return null
    return calcularDescarga(qtd, cliente.descarga_minimo_pallets, cliente.descarga_valor_por_pallet ?? 0)
  }

  async function confirmarLancamento() {
    if (!wizard?.tipo || !usuario) return
    const calculo = calculoAtual()
    if (!calculo) return
    const qtdPaga = wizard.quantidadePagaManual.trim() ? parseInt(wizard.quantidadePagaManual) : calculo.quantidade
    if (!Number.isFinite(qtdPaga) || qtdPaga < 0) return
    const valor = qtdPaga * calculo.valorUnitario
    if (!calculo.dentroParametro && !confirmarFora) { setPasso('confirmacao'); return }

    setSalvando(true)
    setErro(null)
    try {
      let comprovante_url: string | null = null
      if (wizard.comprovanteFile) {
        const ext = wizard.comprovanteFile.name.split('.').pop()
        const path = `${data}/${wizard.cliente.codigo}-${Date.now()}.${ext}`
        const { data: upload, error: upErr } = await supabase.storage
          .from('comprovantes-chapa')
          .upload(path, wizard.comprovanteFile, { upsert: true })
        if (upErr) throw new Error(`Erro ao subir comprovante: ${upErr.message}`)
        if (upload) {
          comprovante_url = supabase.storage.from('comprovantes-chapa').getPublicUrl(upload.path).data.publicUrl
        }
      }

      const lancamento = await registrarLancamento({
        data,
        cliente_codigo: wizard.cliente.codigo,
        cliente_nome: wizard.cliente.nome,
        mapa: wizard.mapaSelecionado,
        motorista: wizard.motorista.trim() || null,
        placa: wizard.placa.trim() || null,
        tipo: wizard.tipo,
        valor_nota: wizard.tipo === 'chapa' ? parseFloat(wizard.valorNota.replace(',', '.')) : null,
        quantidade_pallets: wizard.tipo === 'descarga' ? parseInt(wizard.quantidadePallets) : null,
        quantidade_paga: qtdPaga,
        valor_unitario: calculo.valorUnitario,
        valor_calculado: valor,
        dentro_parametro: calculo.dentroParametro,
        confirmado_fora_parametro: !calculo.dentroParametro && confirmarFora,
        comprovante_url,
        filial: usuario.filial,
        registrado_por: usuario.nome,
      })
      fecharWizard()
      setRecibo(lancamento)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
    setSalvando(false)
  }

  const calculo = wizard ? calculoAtual() : null

  // Quantidade de chapas/pallets efetivamente paga: parte do sugerido pelo
  // cálculo, mas o financeiro pode ajustar (ex.: negociou pagar 2 chapas numa
  // nota que só calcularia 1) sem precisar forjar o valor da nota/contagem.
  function quantidadePagaFinal(): number | null {
    if (!calculo) return null
    if (wizard?.quantidadePagaManual.trim()) {
      const qtd = parseInt(wizard.quantidadePagaManual)
      return Number.isFinite(qtd) && qtd >= 0 ? qtd : null
    }
    return calculo.quantidade
  }

  const quantidadePaga = quantidadePagaFinal()
  const valorFinal = calculo && quantidadePaga != null ? quantidadePaga * calculo.valorUnitario : null

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Chapa / Descarga Paletizada</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clientes com pedido na rua no dia, para lançar o pagamento de Chapa ou Descarga Paletizada.
          </p>
        </div>
        <input
          type="date"
          value={data}
          onChange={e => setData(e.target.value)}
          className="px-3 py-2 text-sm border rounded-md"
        />
      </div>

      {erro && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b font-semibold text-sm">Clientes com mapa hoje ({formatarDataBR(data)})</div>
        {carregando ? (
          <p className="text-sm text-muted-foreground p-4">Carregando…</p>
        ) : clientes.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum cliente de Chapa/Descarga com mapa nesta data.</p>
        ) : (
          <div className="divide-y">
            {clientes.map((item) => {
              const { cliente, mapas, valorNota } = item
              return (
              <div key={cliente.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{cliente.codigo} - {cliente.nome}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                    {cliente.chapa_habilitado && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Chapa</span>}
                    {cliente.descarga_habilitado && <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> Descarga</span>}
                    <span>· nota (CORA): {valorNota != null ? formatarBRL(valorNota) : '—'}</span>
                    {mapas.length > 0 && <span>· mapa(s): {mapas.join(', ')}</span>}
                  </p>
                </div>
                <button
                  onClick={() => iniciarLancamento(item)}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
                >
                  Lançar pagamento
                </button>
              </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b font-semibold text-sm">Pagamentos lançados hoje</div>
        {lancamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum pagamento lançado ainda.</p>
        ) : (
          <div className="divide-y">
            {lancamentos.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{l.cliente_codigo} - {l.cliente_nome} <span className="text-xs text-muted-foreground">({l.tipo === 'chapa' ? 'Chapa' : 'Descarga'}{l.mapa ? ` · mapa ${l.mapa}` : ''})</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    R$ {l.valor_calculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    {!l.dentro_parametro && <span className="text-amber-600 ml-2">fora do parâmetro (confirmado)</span>}
                  </p>
                </div>
                <button onClick={() => setRecibo(l)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-accent rounded" title="Reimprimir recibo">
                  <Printer className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {wizard && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{wizard.cliente.codigo} - {wizard.cliente.nome}</h3>
              <button onClick={fecharWizard}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>

            {passo === 'mapa' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Mais de um mapa hoje — selecione qual deseja pagar.</p>
                <div className="space-y-2">
                  {wizard.mapas.map(m => (
                    <button
                      key={m}
                      onClick={() => { setWizard(w => w && ({ ...w, mapaSelecionado: m })); setPasso('tipo') }}
                      className="w-full text-left px-3 py-2 text-sm border rounded-md hover:bg-accent"
                    >
                      Mapa {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {passo === 'tipo' && (
              <div className="space-y-3">
                {wizard.mapaSelecionado && <p className="text-xs text-muted-foreground">Mapa selecionado: {wizard.mapaSelecionado}</p>}
                <p className="text-sm font-medium">Selecione o tipo de pagamento</p>
                <div className="grid grid-cols-1 gap-2">
                  {wizard.cliente.chapa_habilitado && (
                    <button
                      onClick={() => { setWizard(w => w && ({ ...w, tipo: 'chapa' })); setPasso('valor') }}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm border rounded-md hover:bg-accent"
                    >
                      <Truck className="h-4 w-4 text-emerald-700" /> Chapa
                    </button>
                  )}
                  {wizard.cliente.descarga_habilitado && (
                    <button
                      onClick={() => { setWizard(w => w && ({ ...w, tipo: 'descarga' })); setPasso('valor') }}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm border rounded-md hover:bg-accent"
                    >
                      <Package className="h-4 w-4 text-blue-700" /> Descarga Paletizada
                    </button>
                  )}
                </div>
              </div>
            )}

            {passo === 'valor' && wizard.tipo && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Motorista</label>
                    <input
                      value={wizard.motorista}
                      onChange={e => setWizard(w => w && ({ ...w, motorista: e.target.value }))}
                      placeholder={wizard.buscandoTransportador ? 'Buscando…' : 'Não encontrado na Base — digite'}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Placa</label>
                    <input
                      value={wizard.placa}
                      onChange={e => setWizard(w => w && ({ ...w, placa: e.target.value.toUpperCase() }))}
                      placeholder={wizard.buscandoTransportador ? 'Buscando…' : 'Não encontrada na Base — digite'}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {!wizard.buscandoTransportador && !wizard.motorista && !wizard.placa && (
                  <p className="text-xs text-amber-600">
                    Não achei motorista/placa para o mapa {wizard.mapaSelecionado} na Base do Mapa — confira se ela já foi importada hoje, ou preencha manualmente.
                  </p>
                )}
                {wizard.tipo === 'chapa' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">Valor da nota (R$)</label>
                    <input
                      value={wizard.valorNota}
                      onChange={e => setWizard(w => w && ({ ...w, valorNota: e.target.value, valorNotaOrigemCora: false }))}
                      placeholder={wizard.buscandoValorNota ? 'Buscando no CORA…' : 'Ex: 24500'}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      autoFocus
                    />
                    <p className={`text-xs mt-1 ${wizard.valorNotaOrigemCora ? 'text-green-700' : 'text-muted-foreground'}`}>
                      {wizard.valorNotaOrigemCora
                        ? 'Puxado do CORA — confira antes de confirmar.'
                        : wizard.buscandoValorNota
                          ? 'Buscando no CORA…'
                          : 'Não achei nota do CORA pra esse cliente hoje — digite manualmente.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantidade de pallets</label>
                    <input
                      value={wizard.quantidadePallets}
                      onChange={e => setWizard(w => w && ({ ...w, quantidadePallets: e.target.value }))}
                      placeholder="Ex: 8"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>
                )}

                {calculo && (
                  <div className={`rounded-md p-3 text-sm space-y-2 ${calculo.dentroParametro ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
                    <p className="font-medium flex items-center gap-1.5">
                      {calculo.dentroParametro ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {calculo.dentroParametro ? 'Dentro do parâmetro' : 'Fora do parâmetro'}
                    </p>
                    <p>{calculo.detalhe}</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs whitespace-nowrap">
                        Qtd. de {wizard.tipo === 'chapa' ? 'chapas' : 'pallets'} a pagar:
                      </label>
                      <input
                        value={wizard.quantidadePagaManual || String(calculo.quantidade)}
                        onChange={e => setWizard(w => w && ({ ...w, quantidadePagaManual: e.target.value }))}
                        className="w-16 border rounded-md px-2 py-1 text-sm bg-white"
                      />
                      {quantidadePaga != null && quantidadePaga !== calculo.quantidade && (
                        <span className="text-xs">(sugerido: {calculo.quantidade})</span>
                      )}
                    </div>
                    <p className="font-semibold">
                      Valor a pagar: R$ {(valorFinal ?? calculo.valorCalculado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Comprovante recebido (foto/PDF)</label>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed rounded-md cursor-pointer hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    {wizard.comprovanteFile ? wizard.comprovanteFile.name : 'Selecionar arquivo'}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setWizard(w => w && ({ ...w, comprovanteFile: f })) }}
                    />
                  </label>
                </div>

                <button
                  onClick={confirmarLancamento}
                  disabled={!calculo || quantidadePaga == null || salvando}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {calculo?.dentroParametro === false ? 'Continuar' : 'Confirmar e gerar recibo'}
                </button>
              </div>
            )}

            {passo === 'confirmacao' && calculo && (
              <div className="space-y-4">
                <div className="rounded-md p-3 text-sm bg-amber-50 text-amber-800">
                  <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Fora do parâmetro</p>
                  <p className="mt-1">{calculo.detalhe}</p>
                  <p className="mt-1 font-semibold">Valor a pagar: R$ {(valorFinal ?? calculo.valorCalculado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="mt-2">Deseja confirmar e gerar o recibo mesmo assim?</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPasso('valor')} className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-accent">Recusar</button>
                  <button
                    onClick={() => { setConfirmarFora(true); confirmarLancamento() }}
                    disabled={salvando}
                    className="flex-1 px-4 py-2 text-sm bg-amber-600 text-white rounded-md font-medium disabled:opacity-50"
                  >
                    {salvando ? 'Gerando…' : 'OK, confirmar'}
                  </button>
                </div>
              </div>
            )}

            {erro && <div className="text-sm text-red-700 bg-red-50 rounded-md p-2 mt-3">{erro}</div>}
          </div>
        </div>
      )}

      {recibo && <ReciboModal lancamento={recibo} onClose={() => setRecibo(null)} />}
    </div>
  )
}

const CAMPO_LABEL = 'text-[10px] font-bold uppercase tracking-wide text-[#7a746a]'
const SECAO_TITULO = 'text-xs font-bold uppercase tracking-wide text-[#1a4451] border-b border-[#d9d2c4] pb-1 mb-2'

function ReciboModal({ lancamento, onClose }: { lancamento: LancamentoChapaDescarga; onClose: () => void }) {
  const dataEmissao = formatarDataBR(new Date().toISOString().slice(0, 10))
  const dataLancamento = formatarDataBR(lancamento.data)
  const tipoLabel = lancamento.tipo === 'chapa' ? 'Chapa' : 'Descarga Paletizada'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:bg-white print:p-0">
      <style>{'@media print { @page { size: landscape; margin: 10mm; } }'}</style>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto print:shadow-none print:max-h-none print:rounded-none print:max-w-none">
        <div className="flex items-center justify-between px-6 py-3 border-b print:hidden">
          <h3 className="font-bold">Recibo</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="font-serif text-[#23211d]" id="recibo-impressao">
          <div className="bg-[#1a4451] text-[#f4ece0] px-10 py-5 flex items-center justify-between">
            <div>
              <p className="text-base font-bold tracking-wide">LOG20</p>
              <p className="text-[11px] opacity-80">Log20 Logística S/A</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">Recibo de {tipoLabel}</p>
              <p className="text-xs opacity-80">Emitido em {dataEmissao}</p>
            </div>
          </div>

          <div className="px-10 py-6 space-y-5">
            <div className="flex items-center justify-between bg-[#f4ece0] border border-[#d9d2c4] rounded-md px-5 py-3">
              <div>
                <p className={CAMPO_LABEL}>Cliente</p>
                <p className="text-base">{lancamento.cliente_codigo} - {lancamento.cliente_nome}</p>
              </div>
              <div className="text-right">
                <p className={CAMPO_LABEL}>Valor pago</p>
                <p className="text-2xl font-bold text-[#1a4451]">
                  R$ {lancamento.valor_calculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-5">
                <div>
                  <p className={SECAO_TITULO}>1. Informações do registro</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    <div><p className={CAMPO_LABEL}>Nº do Mapa</p><p>{lancamento.mapa ?? '—'}</p></div>
                    <div><p className={CAMPO_LABEL}>Data</p><p>{dataLancamento}</p></div>
                    <div><p className={CAMPO_LABEL}>Tipo de Carga</p><p>{tipoLabel}</p></div>
                    <div>
                      <p className={CAMPO_LABEL}>Quant. de {lancamento.tipo === 'chapa' ? 'Chapas' : 'Paletes'}</p>
                      <p>{lancamento.quantidade_paga ?? (lancamento.tipo === 'chapa' ? '—' : lancamento.quantidade_pallets ?? '—')}</p>
                    </div>
                    {lancamento.tipo === 'chapa' && (
                      <div>
                        <p className={CAMPO_LABEL}>Valor da Nota</p>
                        <p>R$ {(lancamento.valor_nota ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className={SECAO_TITULO}>2. Dados do transportador</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    <div><p className={CAMPO_LABEL}>Motorista</p><p>{lancamento.motorista ?? '—'}</p></div>
                    <div><p className={CAMPO_LABEL}>Placa Veículo</p><p>{lancamento.placa ?? '—'}</p></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <p className={SECAO_TITULO}>3. Declaração de recebimento</p>
                <p className="text-sm leading-relaxed text-[#4a4640]">
                  Para maior clareza, firmo o presente recibo, que comprova o recebimento integral do valor
                  mencionado, concedendo quitação plena, geral e irrevogável pela quantia recebida.
                </p>
                <div className="mt-auto pt-10 self-end text-center w-64">
                  <p className="border-t border-black pt-1 text-xs text-[#7a746a]">Assinatura do Cliente / Recebedor</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
