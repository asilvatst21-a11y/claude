"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyInviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const link = `${window.location.origin}/entrar?c=${code}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="sm" variant="secondary" onClick={handleCopy}>
      {copied ? "✓ Copiado!" : "Copiar link"}
    </Button>
  );
}
