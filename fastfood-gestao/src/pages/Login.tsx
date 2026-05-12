import { LogIn } from 'lucide-react'
import { signInWithGoogle } from '../store/supabase'

export default function Login() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="text-5xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000, 0 4px 20px rgba(204,0,0,0.5)' }}>
            MACARRÃO
          </div>
          <div className="text-xl font-bold text-white tracking-widest">na</div>
          <div className="text-5xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000, 0 4px 20px rgba(204,0,0,0.5)' }}>
            CHAPA
          </div>
          <div className="mt-3 inline-block bg-[#CC0000] text-white text-xs font-bold px-5 py-1.5 rounded-sm tracking-widest uppercase">
            O ORIGINAL
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
          <div className="bg-[#CC0000] px-5 py-3 text-center">
            <p className="text-white text-sm font-bold">Área do estabelecimento</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Entre com sua conta Google para acessar o sistema de gestão.
              </p>
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 rounded-xl py-3.5 px-4 font-semibold text-gray-800 transition-all text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </button>

            <div className="flex items-start gap-2 text-xs text-gray-600">
              <LogIn size={12} className="mt-0.5 shrink-0 text-[#FFB800]" />
              <span>Seus dados sincronizam automaticamente em qualquer dispositivo com a mesma conta.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
