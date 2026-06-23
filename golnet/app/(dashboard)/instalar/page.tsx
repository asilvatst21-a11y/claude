export const metadata = { title: "Instalar o app — PalpitaAí" };

export default function InstallPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Instalar o PalpitaAí</h1>
      <p className="text-zinc-400 mb-8">
        Adicione o PalpitaAí à tela inicial do seu celular e acesse como um app, sem precisar abrir o navegador.
      </p>

      <div className="flex flex-col gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🍎</span>
            <h2 className="font-semibold text-white">iPhone / iPad (iOS)</h2>
          </div>
          <ol className="flex flex-col gap-2.5">
            <Step n={1} text="Abra o site no Safari (não funciona em outros navegadores como Chrome no iOS)" />
            <Step n={2} text='Toque no ícone de compartilhar (quadrado com seta pra cima) na barra inferior' />
            <Step n={3} text='Role para baixo e toque em "Adicionar à Tela Inicial"' />
            <Step n={4} text='Toque em "Adicionar" no canto superior direito' />
          </ol>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <h2 className="font-semibold text-white">Android</h2>
          </div>
          <ol className="flex flex-col gap-2.5">
            <Step n={1} text="Abra o site no Chrome" />
            <Step n={2} text="Toque nos três pontinhos (⋮) no canto superior direito" />
            <Step n={3} text='Toque em "Adicionar à tela inicial" (ou "Instalar app", se aparecer)' />
            <Step n={4} text='Toque em "Adicionar" / "Instalar"' />
          </ol>
          <p className="text-xs text-zinc-500 mt-4">
            No Android o Chrome costuma oferecer um botão de instalação direto na tela — nesse caso você nem precisa seguir o passo a passo manual.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
        {n}
      </span>
      <span className="text-sm text-zinc-300 leading-relaxed">{text}</span>
    </li>
  );
}
