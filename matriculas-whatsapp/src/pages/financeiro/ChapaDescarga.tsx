import { useEffect, useState } from 'react'
import { Truck, Package, AlertTriangle, CheckCircle2, Printer, X, Upload, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  clientesComMapaHoje, listarLancamentosDoDia, registrarLancamento, calcularChapa, calcularDescarga, buscarMotoristaPlaca,
  type ClienteComMapaHoje, type ClienteChapaDescarga, type LancamentoChapaDescarga, type TipoLancamento,
} from '@/lib/chapaDescarga'

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
    setCarregando(true)
    setErro(null)
    try {
      const [cs, ls] = await Promise.all([clientesComMapaHoje(data), listarLancamentosDoDia(data)])
      setClientes(cs)
      setLancamentos(ls)
    } catch (e) {
      setErro(String(e))
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [data])

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
            {clientes.map(({ cliente, mapas }) => (
              <div key={cliente.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{cliente.codigo} - {cliente.nome}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {cliente.chapa_habilitado && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Chapa</span>}
                    {cliente.descarga_habilitado && <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> Descarga</span>}
                    <span>· mapa(s): {mapas.join(', ')}</span>
                  </p>
                </div>
                <button
                  onClick={() => iniciarLancamento({ cliente, mapas })}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
                >
                  Lançar pagamento
                </button>
              </div>
            ))}
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
                      onChange={e => setWizard(w => w && ({ ...w, valorNota: e.target.value }))}
                      placeholder="Ex: 24500"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground mt-1">Valor digitado manualmente pelo financeiro.</p>
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

function ReciboModal({ lancamento, onClose }: { lancamento: LancamentoChapaDescarga; onClose: () => void }) {
  const dataEmissao = formatarDataBR(new Date().toISOString().slice(0, 10))
  const dataLancamento = formatarDataBR(lancamento.data)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:bg-white print:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto print:shadow-none print:max-h-none print:rounded-none">
        <div className="flex items-center justify-between px-6 py-3 border-b print:hidden">
          <h3 className="font-bold">Recibo</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="p-8 font-serif text-sm leading-normal space-y-5" id="recibo-impressao">
          <div className="flex items-start justify-between">
            <p className="text-base font-bold uppercase">Recibo de {lancamento.tipo === 'chapa' ? 'Chapa' : 'Descarga'}</p>
            <p><span className="font-bold">Valor:</span> R$ {lancamento.valor_calculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="flex items-start justify-between">
            <p className="font-bold">Log20 Logística S/A</p>
            <p><span className="font-bold">Data Emissão:</span> {dataEmissao}</p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold border-b border-black/40 pb-1">1. INFORMAÇÕES DO REGISTRO</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <p><span className="font-bold">Nº do Mapa:</span> {lancamento.mapa ?? '—'}</p>
              <p><span className="font-bold">Tipo de Carga:</span> {lancamento.tipo === 'chapa' ? 'CHAPA' : 'DESCARGA PALETIZADA'}</p>
              <p><span className="font-bold">Cliente:</span> {lancamento.cliente_codigo} - {lancamento.cliente_nome}</p>
              <p><span className="font-bold">Quant. de {lancamento.tipo === 'chapa' ? 'Chapas' : 'Paletes'}:</span> {lancamento.quantidade_paga ?? (lancamento.tipo === 'chapa' ? '—' : lancamento.quantidade_pallets ?? '—')}</p>
              {lancamento.tipo === 'chapa' && (
                <p><span className="font-bold">Valor da Nota:</span> R$ {(lancamento.valor_nota ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              )}
              <p><span className="font-bold">Data:</span> {dataLancamento}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold border-b border-black/40 pb-1">2. DADOS DO TRANSPORTADOR</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <p><span className="font-bold">Motorista:</span> {lancamento.motorista ?? '—'}</p>
              <p><span className="font-bold">Placa Veículo:</span> {lancamento.placa ?? '—'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold border-b border-black/40 pb-1">3. DECLARAÇÃO DE RECEBIMENTO</p>
            <p className="leading-relaxed">
              Para maior clareza, firmo o presente recibo, que comprova o recebimento integral do valor
              mencionado, concedendo quitação plena, geral e irrevogável pela quantia recebida.
            </p>
          </div>

          <div className="pt-10 text-center">
            <p className="border-t border-black inline-block px-16 pt-1">Assinatura do Cliente / Recebedor</p>
          </div>
        </div>
      </div>
    </div>
  )
}
