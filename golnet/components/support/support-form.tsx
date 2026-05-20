"use client";

import { useState } from "react";

export function SupportForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao enviar");
      }

      setSuccess(true);
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="text-green-400 font-medium">Chamado enviado com sucesso!</p>
        <p className="text-zinc-400 text-sm mt-1">Nossa equipe responderá em breve.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 text-sm text-zinc-400 hover:text-white underline"
        >
          Enviar outro chamado
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">Novo chamado</h2>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Assunto</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Descreva brevemente seu problema"
          maxLength={120}
          required
          minLength={5}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Mensagem</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreva seu problema com mais detalhes..."
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
        />
        <p className="text-xs text-zinc-500 mt-1 text-right">{message.length}/2000</p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? "Enviando..." : "Enviar chamado"}
      </button>
    </form>
  );
}
