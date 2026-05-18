import { Link } from 'react-router-dom'
import { UtensilsCrossed, Lock } from 'lucide-react'

export default function ExpiredScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg">
          <UtensilsCrossed size={32} className="text-[#F5C542]" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white mb-2">FastFood Gestão</h1>
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 mb-4">
            <Lock size={13} className="text-yellow-200" />
            <span className="text-yellow-100 text-sm font-medium">Acesso encerrado</span>
          </div>
          <p className="text-yellow-100 text-sm">
            Seu período de teste ou plano expirou.<br />
            Escolha um plano para continuar usando o sistema.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 space-y-3">
          <Link
            to="/planos"
            className="block w-full bg-[#F5C542] hover:bg-[#d4a72c] text-[#0F0F0F] font-bold py-3 rounded-xl text-sm transition-colors"
          >
            Ver planos e assinar
          </Link>
          <a
            href="https://wa.me/5522997457197?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20plano%20FastFood%20Gest%C3%A3o"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Falar com suporte
          </a>
        </div>
        <p className="text-yellow-200 text-xs">
          Já assinou? Aguarde alguns minutos e recarregue a página.
        </p>
      </div>
    </div>
  )
}
