// Ícone "i" com tooltip no hover — para texto que explica o que uma métrica
// significa ou como é calculada, sem deixar isso escrito fixo na tela (ver
// convenção "Sem textos explicativos/metodológicos nas telas" no CLAUDE.md).
export function InfoTip({ texto, posicao = 'top' }: { texto: string; posicao?: 'top' | 'bottom' }) {
  const abreParaBaixo = posicao === 'bottom'
  return (
    <span className="group relative inline-flex">
      <span className="w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[9px] font-bold flex items-center justify-center cursor-default leading-none italic font-serif">i</span>
      <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 w-60 rounded-lg bg-gray-800 text-white text-[11px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg whitespace-normal text-left font-normal ${abreParaBaixo ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}>
        {texto}
      </span>
    </span>
  )
}
