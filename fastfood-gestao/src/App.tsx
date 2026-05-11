import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Vendas from './pages/Vendas'
import Estoque from './pages/Estoque'
import Precificacao from './pages/Precificacao'
import DRE from './pages/DRE'
import Relatorios from './pages/Relatorios'
import Cadastros from './pages/Cadastros'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="precificacao" element={<Precificacao />} />
          <Route path="dre" element={<DRE />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="cadastros" element={<Cadastros />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
