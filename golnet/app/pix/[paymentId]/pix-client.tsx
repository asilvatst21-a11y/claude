"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface Props {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  amount: number;
  plan: string;
  expiresAt: string | null;
}

function formatTime(ms: number) {
  if (ms <= 0) return "00:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PixClient({ paymentId, qrCode, qrCodeBase64, amount, plan, expiresAt }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [status, setStatus] = useState<"pending" | "approved" | "expired">("pending");

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const expiry = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = expiry - Date.now();
      if (diff <= 0) { setTimeLeft(0); setStatus("expired"); return; }
      setTimeLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Poll for payment approval every 5s
  useEffect(() => {
    if (status !== "pending") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/mercadopago/status/${paymentId}`);
        const data = await res.json();
        if (data.status === "approved") {
          setStatus("approved");
          clearInterval(id);
          setTimeout(() => router.push("/pricing?success=1"), 2000);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [paymentId, status, router]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  };

  const planLabel = plan === "PRO" ? "Pro ⭐" : "Empresarial 🏢";

  if (status === "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-white mb-2">Pagamento confirmado!</h1>
          <p className="text-zinc-400">Plano {planLabel} ativado por 30 dias. Redirecionando...</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-white mb-2">PIX expirado</h1>
          <p className="text-zinc-400 mb-6">O QR code expirou. Gere um novo para continuar.</p>
          <a
            href={`/api/mercadopago/checkout?plan=${plan.toLowerCase()}`}
            className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors"
          >
            Gerar novo PIX
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">Aguardando pagamento</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Pague com PIX</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Plano {planLabel} — <span className="text-white font-semibold">R$ {amount.toFixed(2).replace(".", ",")}</span>
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {/* QR Code */}
          {qrCodeBase64 ? (
            <div className="flex justify-center mb-5">
              <div className="p-3 bg-white rounded-xl">
                <Image
                  src={`data:image/png;base64,${qrCodeBase64}`}
                  alt="QR Code PIX"
                  width={200}
                  height={200}
                  className="block"
                  unoptimized
                />
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-5">
              <div className="w-[200px] h-[200px] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 text-sm">
                QR Code indisponível
              </div>
            </div>
          )}

          {/* Instructions */}
          <ol className="text-sm text-zinc-400 space-y-1.5 mb-5 list-none">
            <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">1.</span> Abra o app do seu banco</li>
            <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">2.</span> Escolha pagar via PIX</li>
            <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">3.</span> Escaneie o QR code ou use o código abaixo</li>
          </ol>

          {/* Copy-paste code */}
          {qrCode && (
            <div className="mb-5">
              <p className="text-xs text-zinc-500 mb-1.5">PIX Copia e Cola</p>
              <div className="flex gap-2">
                <div className="flex-1 bg-zinc-800 rounded-lg px-3 py-2.5 text-xs text-zinc-300 font-mono truncate">
                  {qrCode}
                </div>
                <button
                  onClick={handleCopy}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium shrink-0 transition-colors ${
                    copied
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-zinc-700 hover:bg-zinc-600 text-white"
                  }`}
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {/* Timer */}
          {timeLeft !== null && (
            <div className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${
              timeLeft < 5 * 60 * 1000
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-zinc-800 text-zinc-400"
            }`}>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Expira em <span className="font-mono">{formatTime(timeLeft)}</span>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          Esta página atualiza automaticamente após o pagamento.
        </p>
      </div>
    </div>
  );
}
