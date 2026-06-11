"use client";

import { useState } from "react";

export function ProfileVisibilityToggle({ initial }: { initial: boolean }) {
  const [isPublic, setIsPublic] = useState(initial);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !isPublic;
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profilePublic: next }),
    });
    if (res.ok) setIsPublic(next);
    setSaving(false);
  };

  return (
    <div className="flex items-center justify-between py-3 border-t border-zinc-800 mt-4">
      <div>
        <p className="text-sm font-medium text-white">Perfil público</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isPublic
            ? "Outros usuários podem ver seu perfil e histórico de palpites"
            : "Seu perfil está oculto — só você pode ver"}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        aria-label={isPublic ? "Tornar perfil privado" : "Tornar perfil público"}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          isPublic ? "bg-green-500" : "bg-zinc-700"
        } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            isPublic ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
