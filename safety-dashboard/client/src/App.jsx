import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import ColaboradorProfile from './pages/ColaboradorProfile'
import Encaminhamentos from './pages/Encaminhamentos'
import Reports from './pages/Reports'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="colaboradores/:id" element={<ColaboradorProfile />} />
          <Route path="encaminhamentos" element={<Encaminhamentos />} />
          <Route path="relatorios" element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
