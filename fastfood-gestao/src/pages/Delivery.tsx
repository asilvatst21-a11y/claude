import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import {
  getDeliveryConfigLocal, saveDeliveryConfig, fetchDeliveryConfigCloud,
} from '../store/delivery'
import { getPixConfig, id } from '../store/storage'
import { getBusinessId } from '../store/supabase'
import type { DeliveryConfig, DeliveryZone } from '../types'
import {
  Bike, Plus, Trash2, Copy, Check, QrCode, Link2, Power, MapPin, Store, Loader2, MessageCircle, Download,
} from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Delivery() {
  const [cfg, setCfg] = useState<DeliveryConfig>(getDeliveryConfigLocal)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [newZone, setNewZone] = useState({ neighborhood: '', fee: '' })

  const businessId = getBusinessId()
  const link = `${window.location.origin}/pedido/${businessId}`

  // Carrega config da nuvem (sincroniza entre dispositivos), com prefill do PIX já cadastrado
  useEffect(() => {
    fetchDeliveryConfigCloud().then(cloud => {
      if (cloud) {
        setCfg(cloud)
      } else {
        const pix = getPixConfig()
        if (pix) setCfg(c => ({ ...c, pixKey: pix.key, pixName: pix.merchantName, pixCity: pix.city, storeName: c.storeName || pix.merchantName }))
      }
      setLoading(false)
    })
    QRCode.toDataURL(link, { width: 240, margin: 2 }).then(setQrUrl).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch: Partial<DeliveryConfig>) {
    setCfg(c => ({ ...c, ...patch }))
  }

  function persist(next: DeliveryConfig) {
    setCfg(next)
    saveDeliveryConfig(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function handleSave() {
    persist(cfg)
  }

  function toggleEnabled() {
    persist({ ...cfg, enabled: !cfg.enabled })
  }

  function addZone() {
    const fee = parseFloat(newZone.fee.replace(',', '.'))
    if (!newZone.neighborhood.trim() || isNaN(fee)) return
    const zone: DeliveryZone = { id: id(), neighborhood: newZone.neighborhood.trim(), fee }
    update({ zones: [...cfg.zones, zone] })
    setNewZone({ neighborhood: '', fee: '' })
  }

  function removeZone(zid: string) {
    update({ zones: cfg.zones.filter(z => z.id !== zid) })
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const waShare = `https://wa.me/?text=${encodeURIComponent(`Faça seu pedido pelo nosso cardápio digital: ${link}`)}`

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#F5C542]" /></div>
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* Status / toggle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0F0F0F] flex items-center justify-center">
              <Bike size={20} className="text-[#F5C542]" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-lg">Pedido Online</h1>
              <p className="text-xs text-gray-400">Cardápio digital para delivery</p>
            </div>
          </div>
          <button onClick={toggleEnabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${cfg.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            <Power size={15} /> {cfg.enabled ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      </div>

      {/* Link compartilhável */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Link2 size={16} className="text-[#F5C542]" /> Link do cardápio</h2>
        <div className="flex gap-2">
          <input readOnly value={link} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono bg-gray-50 text-gray-500" />
          <button onClick={copyLink} className="bg-[#F5C542] text-[#0F0F0F] px-3 rounded-xl hover:bg-[#d4a72c]">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="flex gap-2">
          <a href={waShare} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white py-2.5 rounded-xl text-sm font-bold">
            <MessageCircle size={15} /> Compartilhar no WhatsApp
          </a>
        </div>
        <p className="text-xs text-gray-400">Cole esse link nas respostas do WhatsApp, no Instagram ou imprima o QR Code abaixo para colar no balcão.</p>

        {qrUrl && (
          <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
            <img src={qrUrl} alt="QR Code" className="w-28 h-28 rounded-lg bg-white p-1.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><QrCode size={14} /> QR Code do cardápio</p>
              <p className="text-xs text-gray-400 mt-1">O cliente escaneia e faz o pedido direto pelo celular.</p>
              <a href={qrUrl} download="cardapio-qrcode.png"
                className="inline-flex items-center gap-1 text-xs text-[#c49a20] font-semibold mt-2 hover:underline">
                <Download size={12} /> Baixar QR Code
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Dados da loja */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Store size={16} className="text-[#F5C542]" /> Dados da loja</h2>
        <Field label="Nome da loja (exibido no cardápio)">
          <input value={cfg.storeName} onChange={e => update({ storeName: e.target.value })}
            placeholder="Ex: Macarrão na Chapa" className={inputCls} />
        </Field>
        <Field label="WhatsApp da loja (com DDD)">
          <input value={cfg.whatsapp} onChange={e => update({ whatsapp: e.target.value })}
            placeholder="Ex: 22999998888" inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Aviso no topo (opcional)">
          <input value={cfg.notice} onChange={e => update({ notice: e.target.value })}
            placeholder="Ex: Entregamos das 18h às 23h" className={inputCls} />
        </Field>
        <Field label="Pedido mínimo (R$)">
          <input value={cfg.minOrder || ''} onChange={e => update({ minOrder: parseFloat(e.target.value) || 0 })}
            placeholder="0,00" inputMode="numeric" className={inputCls} />
        </Field>
      </div>

      {/* PIX */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><QrCode size={16} className="text-[#F5C542]" /> Chave PIX (para o cliente pagar)</h2>
        <Field label="Chave PIX">
          <input value={cfg.pixKey} onChange={e => update({ pixKey: e.target.value })}
            placeholder="CPF, e-mail, telefone ou aleatória" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do recebedor">
            <input value={cfg.pixName} onChange={e => update({ pixName: e.target.value })} placeholder="Nome" className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={cfg.pixCity} onChange={e => update({ pixCity: e.target.value })} placeholder="Cidade" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Bairros / taxas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><MapPin size={16} className="text-[#F5C542]" /> Bairros e taxas de entrega</h2>
        {cfg.zones.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum bairro cadastrado. Adicione os bairros que você atende e a taxa de cada um.</p>
        ) : (
          <div className="space-y-2">
            {cfg.zones.map(z => (
              <div key={z.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <MapPin size={14} className="text-gray-400 shrink-0" />
                <span className="flex-1 text-sm text-gray-700">{z.neighborhood}</span>
                <span className="text-sm font-semibold text-gray-800">{fmt(z.fee)}</span>
                <button onClick={() => removeZone(z.id)} className="text-red-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={newZone.neighborhood} onChange={e => setNewZone(z => ({ ...z, neighborhood: e.target.value }))}
            placeholder="Bairro" className={`flex-1 ${inputCls}`} onKeyDown={e => { if (e.key === 'Enter') addZone() }} />
          <input value={newZone.fee} onChange={e => setNewZone(z => ({ ...z, fee: e.target.value }))}
            placeholder="Taxa R$" inputMode="numeric" className={`w-24 ${inputCls}`} onKeyDown={e => { if (e.key === 'Enter') addZone() }} />
          <button onClick={addZone} className="bg-[#0F0F0F] text-[#F5C542] px-3 rounded-xl shrink-0"><Plus size={18} /></button>
        </div>
      </div>

      {/* Salvar */}
      <div className="sticky bottom-4">
        <button onClick={handleSave}
          className="w-full bg-[#F5C542] text-[#0F0F0F] py-3.5 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          {saved ? <><Check size={18} /> Salvo!</> : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
