'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const nav = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/encaminhamentos', label: 'Encaminhamentos', icon: '📋' },
  { href: '/relatorios', label: 'Relatórios', icon: '📄' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
        <span className="text-xl">{open ? '✕' : '☰'}</span>
      </button>

      {/* Overlay */}
      {open && <div onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 bg-black/30 z-40" />}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-60 bg-gray-900 text-white flex flex-col z-40 transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="px-6 py-5 border-b border-gray-700">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Safety</p>
          <h1 className="text-lg font-bold text-white leading-tight">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">CDD Petropolis</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${pathname === item.href ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}
