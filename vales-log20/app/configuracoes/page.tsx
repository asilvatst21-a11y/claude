"use client";

import { useEffect, useState } from "react";
import { Save, RotateCcw, Send, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const TEMPLATE_DEFAULT =
  "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. " +
  "Vale(s): {vales}. Por favor, procure o financeiro para regularizar.";

const VARIAVEIS = [
  { chave: "{nome}", desc: "Nome do ajudante" },
  { chave: "{qtd}", desc: "Quantidade de vales pendentes" },
  { chave: "{vales}", desc: "Lista dos números dos vales (ex: #1234, #1235)" },
];

const HORARIOS = [
  "06:00", "07:00", "08:00", "09:00", "10:00",
  "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

// BRT = UTC-3, so horario BRT → UTC hora
function brtToUtcHour(brt: string): number {
  const [h] = brt.split(":").map(Number);
  return (h + 3) % 24;
}

function utcHourToBrt(utcHour: number): string {
  const brt = (utcHour + 21) % 24;
  return `${String(brt).padStart(2, "0")}:00`;
}

export default function ConfiguracoesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testando, setTestando] = useState(false);

  const [automatica, setAutomatica] = useState(false);
  const [horario, setHorario] = useState("08:00");
  const [template, setTemplate] = useState(TEMPLATE_DEFAULT);

  useEffect(() => {
    fetch("/api/configuracoes")
      .then((r) => r.json())
      .then((data) => {
        setAutomatica(data.notificacao_automatica === "true");
        if (data.notificacao_horario_utc) {
          setHorario(utcHourToBrt(Number(data.notificacao_horario_utc)));
        }
        if (data.notificacao_template_pendente) {
          setTemplate(data.notificacao_template_pendente);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/configuracoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificacao_automatica: String(automatica),
        notificacao_horario_utc: String(brtToUtcHour(horario)),
        notificacao_template_pendente: template,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Configurações salvas com sucesso" });
    } else {
      toast({ variant: "destructive", title: "Erro ao salvar configurações" });
    }
  }

  async function handleTestarCron() {
    setTestando(true);
    const res = await fetch("/api/cron/notificar");
    const data = await res.json();
    setTestando(false);
    if (data.skipped) {
      toast({ title: "Notificação automática desativada", description: "Ative o modo automático para disparar." });
    } else {
      toast({
        title: `Disparado: ${data.sent ?? 0} mensagem(ns) enviada(s)`,
        description: data.errors?.join(", "),
      });
    }
  }

  const previewMensagem = template
    .replace("{nome}", "João Silva")
    .replace("{qtd}", "2")
    .replace("{vales}", "#12345, #12346");

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Ajuste o comportamento das notificações WhatsApp</p>
      </div>

      {/* Modo de disparo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modo de Disparo</CardTitle>
          <CardDescription>
            Manual: o operador clica em Notificar em cada vale. Automático: o sistema envia diariamente no horário configurado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => setAutomatica(false)}
              className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                !automatica ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
              }`}
            >
              <p className="font-medium text-sm">Manual</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Operador controla quando notificar
              </p>
            </button>
            <button
              onClick={() => setAutomatica(true)}
              className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                automatica ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
              }`}
            >
              <p className="font-medium text-sm">Automático</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sistema envia todos os dias no horário definido
              </p>
            </button>
          </div>

          {automatica && (
            <div className="space-y-2 pt-1">
              <label className="text-sm font-medium">Horário de envio (horário de Brasília)</label>
              <div className="flex flex-wrap gap-2">
                {HORARIOS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorario(h)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      horario === h ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Info className="h-3 w-3" />
                Envia para todos os ajudantes com vales Sem Ação e sem tratativa de transportadora.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template da mensagem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Texto da Mensagem</CardTitle>
          <CardDescription>
            Personalize a mensagem enviada ao ajudante. Use as variáveis abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {VARIAVEIS.map((v) => (
              <button
                key={v.chave}
                onClick={() => setTemplate((t) => t + v.chave)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-mono hover:bg-accent transition-colors"
                title={v.desc}
              >
                {v.chave}
                <span className="text-muted-foreground font-sans">— {v.desc}</span>
              </button>
            ))}
          </div>

          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />

          <button
            onClick={() => setTemplate(TEMPLATE_DEFAULT)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar texto padrão
          </button>

          {/* Preview */}
          <div className="rounded-lg border bg-green-50 border-green-200 p-3">
            <p className="text-xs font-medium text-green-800 mb-1.5">Preview da mensagem:</p>
            <p className="text-sm text-green-900 leading-snug whitespace-pre-wrap">{previewMensagem}</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={handleTestarCron}
          disabled={testando || saving}
          className="gap-2"
        >
          {testando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Disparar agora
        </Button>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
