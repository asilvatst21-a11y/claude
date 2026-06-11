"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } else {
      const data = await res.json();
      setError(data.error ?? "Erro ao redefinir senha.");
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400">Link inválido. Solicite um novo link de recuperação.</p>
        <Link href="/forgot-password" className="text-green-400 hover:underline text-sm mt-4 block">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return done ? (
    <div className="text-center">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-lg font-semibold text-white mb-2">Senha redefinida!</h2>
      <p className="text-zinc-400 text-sm mb-4">
        Sua senha foi atualizada. Você será redirecionado para o login em instantes.
      </p>
      <Link href="/login" className="text-green-400 hover:underline text-sm">
        Ir para o login
      </Link>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        type="password"
        label="Nova senha"
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Input
        type="password"
        label="Confirmar senha"
        placeholder="Repita a nova senha"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} size="lg" disabled={!password || !confirm}>
        Salvar nova senha
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-green-400">Palpita</span>Aí
          </h1>
          <p className="text-zinc-400 mt-2">Nova senha</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
