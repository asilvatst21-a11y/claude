"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (res.ok) {
      setSent(true);
    } else {
      setError("Erro ao enviar email. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-green-400">Palpita</span>Aí
          </h1>
          <p className="text-zinc-400 mt-2">Recuperação de senha</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="text-lg font-semibold text-white mb-2">Email enviado!</h2>
              <p className="text-zinc-400 text-sm mb-6">
                Se esse email estiver cadastrado, você vai receber um link para redefinir sua senha em breve. Verifique também a caixa de spam.
              </p>
              <Link href="/login" className="text-green-400 hover:underline text-sm">
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-zinc-400 mb-2">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>
              <Input
                type="email"
                label="Email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && (
                <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} size="lg" disabled={!email}>
                Enviar link
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-sm text-zinc-400 hover:text-green-400 transition-colors">
                  Voltar para o login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
