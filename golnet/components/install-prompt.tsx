"use client";

import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
  const isAndroid = /Android/.test(ua);
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as Record<string, unknown>).standalone === true;
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem("install-dismissed")) return;

    const p = detectPlatform();
    setPlatform(p);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    setShow(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem("install-dismissed", "1");
    setShow(false);
  };

  const triggerNativePrompt = async () => {
    if (!deferredPrompt) return;
    (deferredPrompt as unknown as { prompt: () => void }).prompt();
    setShow(false);
    localStorage.setItem("install-dismissed", "1");
  };

  if (!show || platform === null) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-80 z-40">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center shrink-0">
            <span className="text-lg">📱</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Instalar o PalpitaAí</p>
            <p className="text-xs text-zinc-400">Acesse rápido pela tela inicial</p>
          </div>
          <button onClick={dismiss} className="text-zinc-500 hover:text-white p-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Android with native prompt */}
        {platform === "android" && deferredPrompt && (
          <div className="p-4 flex gap-2">
            <button
              onClick={triggerNativePrompt}
              className="flex-1 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold py-2 rounded-xl transition-colors"
            >
              Instalar agora
            </button>
            <button onClick={dismiss} className="px-3 py-2 text-zinc-400 hover:text-white text-sm border border-zinc-700 rounded-xl transition-colors">
              Agora não
            </button>
          </div>
        )}

        {/* iOS or Android without native prompt — show steps */}
        {(platform === "ios" || (platform === "android" && !deferredPrompt)) && (
          <div className="p-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <span>Ver passo a passo</span>
              <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded && (
              <ol className="mt-3 space-y-2.5">
                {platform === "ios" ? (
                  <>
                    <Step n={1} text="Abra o site no Safari (não funciona em outros navegadores)" />
                    <Step n={2} text={<>Toque no ícone de compartilhar <ShareIcon /> na barra inferior</>} />
                    <Step n={3} text='Role para baixo e toque em "Adicionar à Tela Inicial"' />
                    <Step n={4} text='Toque em "Adicionar" no canto superior direito' />
                  </>
                ) : (
                  <>
                    <Step n={1} text="Abra o site no Chrome" />
                    <Step n={2} text={<>Toque nos três pontos <DotsIcon /> no canto superior direito</>} />
                    <Step n={3} text='Toque em "Adicionar à tela inicial"' />
                    <Step n={4} text='Toque em "Adicionar"' />
                  </>
                )}
              </ol>
            )}

            <button onClick={dismiss} className="mt-3 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Não mostrar novamente
            </button>
          </div>
        )}

        {/* Desktop */}
        {platform === "desktop" && (
          <div className="p-4 text-sm text-zinc-400">
            No celular, você pode adicionar este site à tela inicial para acesso rápido.
            <button onClick={dismiss} className="mt-2 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors block">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-xs text-zinc-300">
      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
        {n}
      </span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}

function ShareIcon() {
  return (
    <svg className="inline w-4 h-4 mx-0.5 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg className="inline w-4 h-4 mx-0.5 align-text-bottom" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
