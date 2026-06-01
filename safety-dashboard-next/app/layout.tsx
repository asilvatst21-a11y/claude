import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Safety Dashboard — CDD Petropolis',
  description: 'Dashboard de segurança de colaboradores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 lg:ml-60 p-6 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
