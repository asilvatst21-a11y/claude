"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyInviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="sm" variant="secondary" onClick={handleCopy}>
      {copied ? "✓ Copiado!" : "Copiar"}
    </Button>
  );
}
