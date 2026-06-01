import { useLocation } from 'react-router-dom'

const routeTitles = {
  '/': 'Dashboard',
  '/encaminhamentos': 'Encaminhamentos',
  '/relatorios': 'Relatórios',
}

function getTitle(pathname) {
  if (pathname.startsWith('/colaboradores/')) return 'Perfil do Colaborador'
  return routeTitles[pathname] || 'Safety Dashboard'
}

export default function TopBar({ onMenuClick }) {
  const { pathname } = useLocation()
  const title = getTitle(pathname)

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Abrir menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
    </header>
  )
}
