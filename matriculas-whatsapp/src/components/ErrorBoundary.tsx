import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  erro: Error | null
}

// Sem isso, qualquer exceção durante a renderização derruba a árvore
// inteira do React e deixa a tela branca, sem nenhuma pista do que
// aconteceu — péssimo principalmente nas páginas públicas (Conferência,
// Matinal), que rodam no celular do time em campo, sem ninguém de TI perto
// pra abrir o console.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', erro, info.componentStack)
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-sm w-full bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
            <h1 className="text-lg font-bold text-gray-900">Algo deu errado</h1>
            <p className="text-sm text-gray-500">{this.state.erro.message || 'Ocorreu um erro inesperado nesta tela.'}</p>
            <button
              onClick={() => { this.setState({ erro: null }); window.location.reload() }}
              className="w-full bg-accent-500 hover:bg-accent-600 text-white font-bold rounded-xl py-3 text-sm"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
