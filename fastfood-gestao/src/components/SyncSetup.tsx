import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, Copy, Check, X, RefreshCw, LogOut, User } from 'lucide-react'
import { getBusinessId, setBusinessId, supabase, signOut } from '../store/supabase'
import { pullFromCloud, pushAllToCloud } from '../store/sync'

interface Props {
  session: Session | null
}

export default function SyncSetup({ session }: Props) {
  const [open, setOpen] = useState(false)
  const [bid, setBid] = useState(getBusinessId)
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState('')

  if (!supabase) return null

  async function handleCopy() {
    await navigator.clipboard.writeText(bid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleLink() {
    const clean = input.trim()
    if (!clean) return
    setStatus('Vinculando...')
    setBusinessId(clean)
    setBid(clean)
    const ok = await pullFromCloud()
    setStatus(ok ? '✅ Dados sincronizados! Recarregando...' : '⚠️ Nenhum dado encontrado para esse código.')
    if (ok) setTimeout(() => window.location.reload(), 1500)
  }

  async function handlePushAll() {
    setStatus('Enviando dados para a nuvem...')
    await pushAllToCloud()
    setStatus('✅ Todos os dados enviados!')
    setTimeout(() => setStatus(''), 3000)
  }

  async function handleSignOut() {
    await signOut()
    window.location.reload()
  }

  const isGoogleAuth = !!session

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-30 bg-orange-500 hover:bg-orange-600 text-white rounded-full p-3 shadow-lg"
        title="Sincronização entre dispositivos"
      >
        <Cloud size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Cloud size={18} className="text-orange-500" />
                <h2 className="font-bold text-gray-800">Sincronização</h2>
              </div>
              <button onClick={() => setOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-5">
              {isGoogleAuth ? (
                <>
                  {/* Logged-in view */}
                  <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shrink-0">
                      {session.user.user_metadata?.avatar_url ? (
                        <img
                          src={session.user.user_metadata.avatar_url}
                          className="w-10 h-10 rounded-full"
                          alt=""
                        />
                      ) : (
                        <User size={20} className="text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {session.user.user_metadata?.full_name || session.user.email}
                      </p>
                      <p className="text-xs text-green-600 font-medium">✓ Sincronização automática ativa</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    Seus dados sincronizam automaticamente em todos os dispositivos com esta conta Google.
                  </p>

                  {/* Send local data */}
                  <button onClick={handlePushAll}
                    className="w-full flex items-center justify-center gap-2 border border-orange-200 text-orange-600 py-2 rounded-lg hover:bg-orange-50 text-sm font-medium">
                    <RefreshCw size={15} /> Enviar dados locais para a nuvem
                  </button>

                  {/* Sign out */}
                  <button onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-500 py-2 rounded-lg hover:bg-red-50 text-sm font-medium">
                    <LogOut size={15} /> Sair da conta
                  </button>
                </>
              ) : (
                <>
                  {/* Legacy code-based sync */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Código deste negócio</p>
                    <div className="flex gap-2">
                      <input readOnly value={bid}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-500" />
                      <button onClick={handleCopy}
                        className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600">
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Copie e cole em outro dispositivo para sincronizar</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Vincular a outro dispositivo</p>
                    <div className="flex gap-2">
                      <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Cole o código aqui..."
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-400"
                      />
                      <button onClick={handleLink} disabled={!input.trim()}
                        className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm font-medium">
                        Vincular
                      </button>
                    </div>
                  </div>

                  <button onClick={handlePushAll}
                    className="w-full flex items-center justify-center gap-2 border border-orange-200 text-orange-600 py-2 rounded-lg hover:bg-orange-50 text-sm font-medium">
                    <RefreshCw size={15} /> Enviar dados locais para a nuvem
                  </button>
                </>
              )}

              {status && (
                <p className="text-sm text-center text-gray-600 bg-gray-50 rounded-lg py-2 px-3">{status}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
