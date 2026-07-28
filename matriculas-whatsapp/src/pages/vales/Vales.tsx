import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Loader2, RefreshCw, Eye, Search, X, Send, UserPlus, AlertTriangle, Clock, ChevronUp, ChevronDown, ChevronsUpDown, Download, GitBranch, FileWarning, ShieldAlert, MoreVertical } from "lucide-react";
import { ValeDetalhesModal, type ValeDetalhes } from "./ValeDetalhesModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateBR, calcPrazo, type PrazoStatus } from "@/lib/valesUtils";
import { valesSupabase } from "@/lib/valesSupabase";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { enviarMensagemGrupo, aguardarEntreEnvios, variarTexto } from "@/lib/zapi";
import { sendMessage } from "@/lib/valesZapi";
import { formatPhoneForZAPI } from "@/lib/valesUtils";
import { buscarStatusColaboradoresPorNomeGlobal, podeEnviarPara } from "@/lib/statusAtivo";

interface ValeRow extends ValeDetalhes {
  notificacao_pendente_enviada: boolean;
  notificacao_final_enviada: boolean;
}

interface AjudanteSimples {
  id: string;
  codigo: number;
  nome: string;
  telefone: string | null;
}

function getStatusBadgeVariant(status: string | null) {
  switch (status) {
    case "Abonado": return "success" as const;
    case "Faturado": return "destructive" as const;
    case "Faturar": return "warning" as const;
    default: return "gray" as const;
  }
}

function getAcaoBadgeVariant(acao: string | null) {
  switch (acao) {
    case "Aprovado": return "success" as const;
    case "Reprovado": return "destructive" as const;
    default: return "secondary" as const;
  }
}

const PRAZO_STYLES: Record<PrazoStatus, string> = {
  ok:      "bg-green-50 text-green-700 border-green-200",
  alerta:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  urgente: "bg-orange-50 text-orange-700 border-orange-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};

type SortField = "mapa" | "numero_vale" | "data_emissao" | "itens" | "valor_total" | "status_vale" | "prazo";
type SortDir = "asc" | "desc";

interface RankingAjudante {
  nome: string;
  totalGerados: number;
  valorGerado: number;
  totalAbonados: number;
  valorAbonado: number;
  totalFaturados: number;
  valorFaturado: number;
}
type RankingSortField = "totalGerados" | "valorGerado" | "totalAbonados" | "valorAbonado" | "totalFaturados" | "valorFaturado";

// Um vale com 2 ajudantes (vale dividido) conta pra cada um — os dois
// geraram o vale, mesmo que a responsabilidade seja compartilhada. Vales
// sem ajudante atribuído não entram no ranking (já aparecem na aba
// "Sem ajudante").
function calcularRankingAjudantes(lista: ValeRow[]): RankingAjudante[] {
  const mapa = new Map<string, RankingAjudante>();
  const get = (nome: string) => {
    let r = mapa.get(nome);
    if (!r) {
      r = { nome, totalGerados: 0, valorGerado: 0, totalAbonados: 0, valorAbonado: 0, totalFaturados: 0, valorFaturado: 0 };
      mapa.set(nome, r);
    }
    return r;
  };
  for (const v of lista) {
    const valor = v.valor_total ?? 0;
    for (const a of v.ajudantes) {
      const r = get(a.nome);
      r.totalGerados += 1;
      r.valorGerado += valor;
      if (v.status_vale === "Abonado") { r.totalAbonados += 1; r.valorAbonado += valor; }
      if (v.status_vale === "Faturado" || v.status_vale === "Faturar") { r.totalFaturados += 1; r.valorFaturado += valor; }
    }
  }
  return [...mapa.values()];
}

function sortRanking(lista: RankingAjudante[], field: RankingSortField, dir: SortDir): RankingAjudante[] {
  return [...lista].sort((a, b) => {
    const cmp = a[field] - b[field];
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortableHead({
  field, label, sortField, sortDir, onSort, className,
}: {
  field: SortField; label: string; sortField: SortField | null; sortDir: SortDir;
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = sortField === field;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}

function deadlineMs(dataEmissao: string | null | undefined): number {
  if (!dataEmissao) return Number.MAX_SAFE_INTEGER;
  return new Date(dataEmissao + "T00:00:00").getTime() + 3 * 24 * 60 * 60 * 1000;
}

function sortVales(list: ValeRow[], field: SortField | null, dir: SortDir): ValeRow[] {
  if (!field) return list;
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "mapa": cmp = (a.mapa ?? -1) - (b.mapa ?? -1); break;
      case "numero_vale": cmp = (a.numero_vale ?? 0) - (b.numero_vale ?? 0); break;
      case "data_emissao": cmp = (a.data_emissao ?? "").localeCompare(b.data_emissao ?? ""); break;
      case "itens": cmp = a.itens.length - b.itens.length; break;
      case "valor_total": cmp = (a.valor_total ?? 0) - (b.valor_total ?? 0); break;
      case "status_vale": cmp = (a.status_vale ?? "").localeCompare(b.status_vale ?? "", "pt-BR"); break;
      case "prazo": cmp = deadlineMs(a.data_emissao) - deadlineMs(b.data_emissao); break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function PrazoBadge({ dataEmissao }: { dataEmissao: string | null }) {
  const info = calcPrazo(dataEmissao);
  if (!info) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${PRAZO_STYLES[info.status]}`}>
      {(info.status === "urgente" || info.status === "vencido") && <AlertTriangle className="h-3 w-3" />}
      {info.status === "ok" && <Clock className="h-3 w-3" />}
      {info.label}
    </span>
  );
}

function buildMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

const TEMPLATE_DEFAULT =
  "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. " +
  "Vale(s): {vales}. Por favor, procure o financeiro para regularizar.";

// Variações do template padrão — se o usuário não personalizou a mensagem
// (nas Configurações), o envio sorteia uma redação diferente pra cada
// ajudante em vez do texto idêntico pra todo mundo, um dos gatilhos de
// bloqueio por spam. Uma mensagem personalizada nas Configurações desativa
// a variação automática (respeita o texto configurado).
const TEMPLATE_DEFAULT_VARIANTES = [
  TEMPLATE_DEFAULT,
  "Oi, {nome}! Você tem {qtd} vale(s) pendente(s) no LOG20 que precisam ser resolvidos. " +
  "Vale(s): {vales}. Procure o financeiro pra regularizar, por favor.",
  "{nome}, tudo bem? Consta {qtd} vale(s) pendente(s) no sistema LOG20 no seu nome. " +
  "Vale(s): {vales}. Passa no financeiro pra regularizar quando puder.",
];

const MENSAGEM_TELEFONE_MANUAL =
  "Prezado colaborador, você possui pendências, procure o setor financeiro em até 24h.";

const MENSAGEM_TELEFONE_MANUAL_VARIANTES = [
  MENSAGEM_TELEFONE_MANUAL,
  "Olá! Consta uma pendência em seu nome — procure o setor financeiro em até 24h.",
  "Oi, tudo bem? Você tem uma pendência a resolver — passe no financeiro em até 24h.",
];

// Acrescenta o link de autoatendimento na MESMA mensagem (nunca uma segunda
// mensagem) — só quando a Consulta de Pendências estiver ativa.
function comLinkPendencias(mensagem: string, ativo: boolean): string {
  if (!ativo) return mensagem;
  const link = `${window.location.origin}/consulta-pendencias`;
  return `${mensagem} Se quiser já adiantar uma explicação, acesse: ${link}`;
}

const MENSAGEM_ATUALIZACAO_FINAL =
  "Olá {nome}! Há uma atualização nas suas pendências financeiras. Acesse: {link}";

const MENSAGEM_ATUALIZACAO_FINAL_VARIANTES = [
  MENSAGEM_ATUALIZACAO_FINAL,
  "Oi, {nome}! Suas pendências financeiras tiveram uma atualização. Acesse: {link}",
  "{nome}, passando pra avisar: houve uma atualização nas suas pendências financeiras. Acesse: {link}",
];

export default function ValesPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [vales, setVales] = useState<ValeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [rankingSortField, setRankingSortField] = useState<RankingSortField>("totalGerados");
  const [rankingSortDir, setRankingSortDir] = useState<SortDir>("desc");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [detalhesVale, setDetalhesVale] = useState<ValeDetalhes | null>(null);

  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ajudanteFiltro, setAjudanteFiltro] = useState(
    searchParams.get("ajudante") ?? "todos"
  );

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const [ajudantesList, setAjudantesList] = useState<AjudanteSimples[]>([]);
  const [previewVale, setPreviewVale] = useState<ValeRow | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [atribuirVale, setAtribuirVale] = useState<ValeRow | null>(null);
  const [buscaAtribuir, setBuscaAtribuir] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);

  const [fluxoVale, setFluxoVale] = useState<ValeRow | null>(null);
  const [fluxoAjudante, setFluxoAjudante] = useState("");
  const [fluxoData, setFluxoData] = useState("");
  const [solicitandoFluxo, setSolicitandoFluxo] = useState(false);

  const [contestarVale, setContestarVale] = useState<ValeRow | null>(null);
  const [motivoContestacao, setMotivoContestacao] = useState("");
  const [contestando, setContestando] = useState(false);

  // Menu de ações por linha — um só botão "Ações" abre um dropdown com as
  // opções (Atribuir/Detalhes/Notificar/Fluxo/Contestar), no lugar de vários
  // botões lado a lado, pra sobrar espaço na tabela pras outras colunas.
  // Renderizado via portal (position: fixed, ancorado no botão clicado) pra
  // não ficar cortado pelo scroll da tabela.
  const [acoesAbertoId, setAcoesAbertoId] = useState<string | null>(null);
  const [acoesPos, setAcoesPos] = useState<{ top: number; left: number } | null>(null);
  const acoesMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!acoesAbertoId) return;
    function fechar() {
      setAcoesAbertoId(null);
    }
    function aoClicarFora(e: MouseEvent) {
      if (acoesMenuRef.current && !acoesMenuRef.current.contains(e.target as Node)) fechar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [acoesAbertoId]);

  function toggleAcoes(e: React.MouseEvent<HTMLButtonElement>, valeId: string) {
    if (acoesAbertoId === valeId) {
      setAcoesAbertoId(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setAcoesPos({ top: r.bottom + 4, left: r.right });
    setAcoesAbertoId(valeId);
  }

  // Consulta de Pendências (link de autoatendimento) — só entra na mensagem
  // quando a chave "consulta_pendencias_ativa" estiver ligada em Configurações.
  const [linkPendenciasAtivo, setLinkPendenciasAtivo] = useState(false);
  const [notificandoResolucaoId, setNotificandoResolucaoId] = useState<string | null>(null);

  const fetchVales = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await valesSupabase
        .from("vales")
        .select(`
          id, numero_vale, data_emissao, mapa, motorista, veiculo, data_rota,
          status_vale, acao_transportadora, justificativa_transportadora,
          acao_primeiro_nivel, data_primeiro_nivel, usuario_primeiro_nivel,
          motivo_primeiro_nivel, justificativa_primeiro_nivel, valor_total,
          contestado, motivo_contestacao, contestado_em,
          notificacao_pendente_enviada, notificacao_final_enviada,
          vale_ajudantes ( posicao, ajudantes ( id, codigo, nome, telefone ) ),
          vale_itens ( id, tipo_item, item, unidade, qtde_diferenca, qtde_diferenca_avulsa, valor )
        `)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const transformed = (data ?? []).map((v) => ({
        ...v,
        ajudantes: (v.vale_ajudantes as never[])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => a.posicao - b.posicao)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((va: any) => va.ajudantes)
          .filter(Boolean),
        itens: v.vale_itens as never[],
      })) as ValeRow[];

      setVales(transformed);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao carregar vales",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchAjudantes = useCallback(async () => {
    const { data } = await valesSupabase
      .from("ajudantes")
      .select("id, codigo, nome, telefone")
      .order("nome");
    if (data) setAjudantesList(data);
  }, []);

  useEffect(() => {
    fetchVales();
    fetchAjudantes();
    valesSupabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "consulta_pendencias_ativa")
      .maybeSingle()
      .then(({ data }) => setLinkPendenciasAtivo(data?.valor === "true"));
  }, [fetchVales, fetchAjudantes]);

  const openPreview = useCallback(async (vale: ValeRow) => {
    setPreviewTemplate(null);
    setManualPhone("");
    setPreviewVale(vale);
    try {
      const { data } = await valesSupabase
        .from("configuracoes")
        .select("chave, valor");
      const config: Record<string, string> = {};
      for (const row of data ?? []) config[row.chave] = row.valor ?? "";
      setPreviewTemplate(config.notificacao_template_pendente || TEMPLATE_DEFAULT);
      setLinkPendenciasAtivo(config.consulta_pendencias_ativa === "true");
    } catch {
      setPreviewTemplate(TEMPLATE_DEFAULT);
    }
  }, []);

  const sendNotificacao = async (valeId: string, numeroVale: number, telefoneManual?: string) => {
    setNotifyingId(valeId);
    setPreviewVale(null);
    try {
      const vale = vales.find((v) => v.id === valeId);
      if (!vale) throw new Error("Vale não encontrado");

      // Sem ajudante com telefone: o usuário digitou um número na hora.
      // Como não temos o nome da pessoa, enviamos uma mensagem genérica.
      if (telefoneManual) {
        const phone = formatPhoneForZAPI(telefoneManual);
        if (!phone) throw new Error("Telefone inválido");

        const mensagemManual = comLinkPendencias(variarTexto(MENSAGEM_TELEFONE_MANUAL_VARIANTES), linkPendenciasAtivo);
        const result = await sendMessage(phone, mensagemManual);

        await valesSupabase.from("notificacoes").insert({
          vale_id: valeId,
          ajudante_id: null,
          tipo: "pendente",
          telefone: phone,
          mensagem: mensagemManual,
          status: result.success ? "enviado" : "erro",
          erro_detalhe: result.error ?? null,
          enviada_em: result.success ? new Date().toISOString() : null,
        });

        if (!result.success) {
          throw new Error(result.error || "Erro ao enviar");
        }

        await valesSupabase
          .from("vales")
          .update({ notificacao_pendente_enviada: true })
          .eq("id", valeId);

        toast({
          title: "Notificação enviada",
          description: `Mensagem WhatsApp enviada para vale #${numeroVale}`,
        });
        await fetchVales();
        return;
      }

      const statusPorNomeVale = await buscarStatusColaboradoresPorNomeGlobal();
      const ajudantesComTel = [];
      for (const a of vale.ajudantes) {
        if (!a.telefone) continue;
        if (await podeEnviarPara({ origem: "vales_notificacao_pendente", filial: null, mapaStatus: statusPorNomeVale, nome: a.nome, telefone: a.telefone, detalhe: `Vale #${numeroVale}` })) {
          ajudantesComTel.push(a);
        }
      }
      if (ajudantesComTel.length === 0) {
        throw new Error("Nenhum ajudante com telefone cadastrado");
      }

      const { data: configData } = await valesSupabase
        .from("configuracoes")
        .select("chave, valor");
      const config: Record<string, string> = {};
      for (const row of configData ?? []) config[row.chave] = row.valor ?? "";
      const template = config.notificacao_template_pendente || TEMPLATE_DEFAULT;
      const ativo = config.consulta_pendencias_ativa === "true";

      let sent = 0;
      for (const ajudante of ajudantesComTel) {
        const phone = formatPhoneForZAPI(ajudante.telefone);
        if (!phone) continue;
        const templateEfetivo = template === TEMPLATE_DEFAULT ? variarTexto(TEMPLATE_DEFAULT_VARIANTES) : template;
        const mensagem = comLinkPendencias(buildMensagem(templateEfetivo, {
          nome: ajudante.nome,
          qtd: "1",
          vales: `#${numeroVale}`,
        }), ativo);
        const result = await sendMessage(phone, mensagem);

        await valesSupabase.from("notificacoes").insert({
          vale_id: valeId,
          ajudante_id: ajudante.id,
          tipo: "pendente",
          telefone: ajudante.telefone,
          mensagem: `Vale #${numeroVale} - notificação pendente`,
          status: result.success ? "enviado" : "erro",
          erro_detalhe: result.error ?? null,
          enviada_em: result.success ? new Date().toISOString() : null,
        });

        if (result.success) sent++;
        await aguardarEntreEnvios();
      }

      if (sent > 0) {
        await valesSupabase
          .from("vales")
          .update({ notificacao_pendente_enviada: true })
          .eq("id", valeId);
      }

      toast({
        title: "Notificação enviada",
        description: `${sent} mensagem(ns) WhatsApp enviada(s) para vale #${numeroVale}`,
      });
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao notificar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setNotifyingId(null);
      setManualPhone("");
    }
  };

  // Aviso de atualização (tratativa final Abonado/Faturado) — mesmo link e
  // mesmo login por CPF da notificação inicial, sem gerar um link novo por
  // pendência. Só aparece com a Consulta de Pendências ativa.
  const notificarResolucao = async (vale: ValeRow) => {
    setNotificandoResolucaoId(vale.id);
    try {
      const statusPorNomeVale = await buscarStatusColaboradoresPorNomeGlobal();
      const ajudantesComTel = [];
      for (const a of vale.ajudantes) {
        if (!a.telefone) continue;
        if (await podeEnviarPara({ origem: "vales_notificacao_resolucao", filial: null, mapaStatus: statusPorNomeVale, nome: a.nome, telefone: a.telefone, detalhe: `Vale #${vale.numero_vale}` })) {
          ajudantesComTel.push(a);
        }
      }
      if (ajudantesComTel.length === 0) {
        throw new Error("Nenhum ajudante com telefone cadastrado");
      }
      const link = `${window.location.origin}/consulta-pendencias`;
      let sent = 0;
      for (const ajudante of ajudantesComTel) {
        const phone = formatPhoneForZAPI(ajudante.telefone);
        if (!phone) continue;
        const mensagem = buildMensagem(variarTexto(MENSAGEM_ATUALIZACAO_FINAL_VARIANTES), { nome: ajudante.nome, link });
        const result = await sendMessage(phone, mensagem);

        await valesSupabase.from("notificacoes").insert({
          vale_id: vale.id,
          ajudante_id: ajudante.id,
          tipo: "resolvido",
          telefone: ajudante.telefone,
          mensagem: `Vale #${vale.numero_vale} resolvido - Status: ${vale.status_vale}`,
          status: result.success ? "enviado" : "erro",
          erro_detalhe: result.error ?? null,
          enviada_em: result.success ? new Date().toISOString() : null,
        });
        if (result.success) sent++;
        await aguardarEntreEnvios();
      }

      if (sent > 0) {
        await valesSupabase.from("vales").update({ notificacao_final_enviada: true }).eq("id", vale.id);
      }
      toast({
        title: "Aviso de atualização enviado",
        description: `${sent} mensagem(ns) WhatsApp enviada(s) para vale #${vale.numero_vale}`,
      });
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao notificar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setNotificandoResolucaoId(null);
    }
  };

  const handleAtribuirAjudante = async (ajudanteId: string) => {
    if (!atribuirVale) return;
    setAtribuindo(true);
    try {
      const { data: existing } = await valesSupabase
        .from("vale_ajudantes")
        .select("posicao")
        .eq("vale_id", atribuirVale.id)
        .order("posicao", { ascending: false })
        .limit(1);
      const nextPosicao = existing && existing.length > 0 ? existing[0].posicao + 1 : 1;

      const { error } = await valesSupabase
        .from("vale_ajudantes")
        .upsert(
          { vale_id: atribuirVale.id, ajudante_id: ajudanteId, posicao: nextPosicao },
          { onConflict: "vale_id,ajudante_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);

      toast({ title: "Ajudante atribuído com sucesso" });
      setAtribuirVale(null);
      setBuscaAtribuir("");
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setAtribuindo(false);
    }
  };

  function abrirSolicitarFluxo(vale: ValeRow) {
    const primeiroAjudante = vale.ajudantes[0]?.nome ?? "";
    setFluxoAjudante(primeiroAjudante);
    setFluxoData(vale.data_emissao ?? new Date().toISOString().slice(0, 10));
    setFluxoVale(vale);
  }

  async function handleSolicitarFluxo() {
    if (!fluxoVale || !fluxoAjudante.trim() || !usuario) return;
    setSolicitandoFluxo(true);
    try {
      const registradoPor = usuario.nome ?? usuario.login;
      const colaborador = fluxoAjudante.trim();
      const dataFormatada = fluxoData ? formatDateBR(fluxoData) : "—";
      const obs = `Vale #${fluxoVale.numero_vale}${fluxoVale.mapa ? ` · Mapa ${fluxoVale.mapa}` : ""}`;

      const { error } = await supabase.from("fluxo_punitivo").insert({
        filial: usuario.filial,
        colaborador_nome: colaborador,
        origem: "Vales",
        tipo_acao: null,
        status: "Solicitado",
        motivo: "GERAÇÃO DE VALE FISICO",
        data_infracao: fluxoData || null,
        observacao: obs,
        registrado_por: registradoPor,
        source_id: null,
        dias_suspensao: null,
        data_acao: null,
      });
      if (error) throw new Error(error.message);

      // Envia para o grupo WhatsApp da filial (igual ao fluxo do GSDPQ)
      const { data: filialData } = await supabase
        .from("filiais")
        .select("grupo_fluxo_whatsapp")
        .eq("nome", usuario.filial)
        .single();
      const grupo = filialData?.grupo_fluxo_whatsapp ?? null;
      if (grupo) {
        const mensagem =
          `🔔 *Solicitação de Fluxo Punitivo*\n` +
          `📍 Filial: ${usuario.filial}\n` +
          `👤 Colaborador: ${colaborador}\n` +
          `📋 Origem: Vales\n` +
          `🗓️ Data: ${dataFormatada}\n` +
          `💰 ${obs}\n` +
          `⚠️ Motivo: GERAÇÃO DE VALE FISICO\n` +
          `✍️ Solicitado por: ${registradoPor}`;
        const { sucesso, erro } = await enviarMensagemGrupo(grupo, mensagem);
        await supabase.from("disparos").insert({
          filial: usuario.filial, whatsapp: grupo, mensagem,
          status: sucesso ? "enviado" : "erro", erro: erro ?? null,
        });
        if (!sucesso) {
          toast({ variant: "destructive", title: "Fluxo registrado", description: `Solicitação salva, mas a mensagem para o grupo falhou: ${erro}` });
          setFluxoVale(null);
          return;
        }
      }

      toast({ title: "Fluxo solicitado", description: `Solicitação registrada para ${colaborador}` });
      setFluxoVale(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao solicitar fluxo", description: err instanceof Error ? err.message : "Erro desconhecido" });
    } finally {
      setSolicitandoFluxo(false);
    }
  }

  const openContestar = (vale: ValeRow) => {
    setContestarVale(vale);
    setMotivoContestacao(vale.motivo_contestacao ?? "");
  };

  const handleContestar = async () => {
    if (!contestarVale || !motivoContestacao.trim()) return;
    setContestando(true);
    try {
      const { error } = await valesSupabase
        .from("vales")
        .update({
          contestado: true,
          motivo_contestacao: motivoContestacao.trim(),
          contestado_em: new Date().toISOString(),
        })
        .eq("id", contestarVale.id);
      if (error) throw new Error(error.message);

      toast({ title: "Contestação registrada", description: `Vale #${contestarVale.numero_vale} marcado como contestado.` });
      setContestarVale(null);
      setMotivoContestacao("");
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setContestando(false);
    }
  };

  function exportContestados() {
    const rows = valesFiltered.filter((v) => v.contestado);
    const data = rows.map((v) => ({
      "Vale #": v.numero_vale,
      "Mapa": v.mapa ?? "",
      "Data Emissão": v.data_emissao ?? "",
      "Data da Rota": v.data_rota ?? "",
      "Motorista": v.motorista ?? "",
      "Veículo": v.veiculo ?? "",
      "Ajudante(s)": v.ajudantes.map((a) => a.nome).join(" / "),
      "Valor Total": v.valor_total ?? 0,
      "Status do Vale": v.status_vale ?? "",
      "Ação Transportadora": v.acao_transportadora ?? "",
      "Justificativa Transportadora": v.justificativa_transportadora ?? "",
      "Ação Primeiro Nível": v.acao_primeiro_nivel ?? "",
      "Data Primeiro Nível": v.data_primeiro_nivel ?? "",
      "Usuário Primeiro Nível": v.usuario_primeiro_nivel ?? "",
      "Motivo Primeiro Nível": v.motivo_primeiro_nivel ?? "",
      "Justificativa Primeiro Nível": v.justificativa_primeiro_nivel ?? "",
      "Motivo da Contestação": v.motivo_contestacao ?? "",
      "Contestado em": v.contestado_em ? new Date(v.contestado_em).toLocaleString("pt-BR") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 12 },
      { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 40 },
      { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 30 }, { wch: 40 },
      { wch: 50 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vales Contestados");
    XLSX.writeFile(wb, `vales-contestados-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const hasFilters = busca || dataInicio || dataFim || ajudanteFiltro !== "todos";

  function applyFilters(list: ValeRow[]): ValeRow[] {
    return list.filter((v) => {
      if (dataInicio && v.data_emissao && v.data_emissao < dataInicio) return false;
      if (dataFim && v.data_emissao && v.data_emissao > dataFim) return false;
      if (ajudanteFiltro !== "todos") {
        if (!v.ajudantes.some((a) => a.id === ajudanteFiltro)) return false;
      }
      if (busca) {
        const q = busca.toLowerCase();
        const matchVale = String(v.numero_vale).includes(q);
        const matchMapa = v.mapa != null && String(v.mapa).includes(q);
        const matchAj = v.ajudantes.some((a) => a.nome.toLowerCase().includes(q));
        const matchMotorista = v.motorista?.toLowerCase().includes(q) ?? false;
        if (!matchVale && !matchMapa && !matchAj && !matchMotorista) return false;
      }
      return true;
    });
  }

  function filterByTab(list: ValeRow[], tab: string): ValeRow[] {
    switch (tab) {
      case "pendentes": return list.filter((v) => v.status_vale === "Sem Ação");
      case "faturados": return list.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar");
      case "abonados": return list.filter((v) => v.status_vale === "Abonado");
      case "sem_ajudante": return list.filter((v) => v.ajudantes.length === 0);
      default: return list;
    }
  }

  const valesFiltered = applyFilters(vales);
  const filteredVales = sortVales(filterByTab(valesFiltered, activeTab), sortField, sortDir);

  const resumo = {
    total: valesFiltered.length,
    valorTotal: valesFiltered.reduce((s, v) => s + (v.valor_total ?? 0), 0),
    abonados: valesFiltered.filter((v) => v.status_vale === "Abonado").length,
    valorAbonado: valesFiltered.filter((v) => v.status_vale === "Abonado").reduce((s, v) => s + (v.valor_total ?? 0), 0),
    faturados: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").length,
    valorFaturado: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").reduce((s, v) => s + (v.valor_total ?? 0), 0),
    pendentes: valesFiltered.filter((v) => v.status_vale === "Sem Ação").length,
  };

  const tabCounts = {
    todos: valesFiltered.length,
    pendentes: valesFiltered.filter((v) => v.status_vale === "Sem Ação").length,
    faturados: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").length,
    abonados: valesFiltered.filter((v) => v.status_vale === "Abonado").length,
    sem_ajudante: valesFiltered.filter((v) => v.ajudantes.length === 0).length,
  };

  const ajudantesComTelefone = previewVale?.ajudantes.filter((a) => a.telefone) ?? [];
  const ajudantesSemTelefone = previewVale?.ajudantes.filter((a) => !a.telefone) ?? [];

  const ajudantesAtribuirFiltrados = ajudantesList.filter((a) => {
    const q = buscaAtribuir.toLowerCase();
    return !q || a.nome.toLowerCase().includes(q) || String(a.codigo).includes(q);
  });

  const tabs = [
    { value: "todos", label: "Todos", count: tabCounts.todos },
    { value: "pendentes", label: "Pendentes", count: tabCounts.pendentes },
    { value: "faturados", label: "Faturados", count: tabCounts.faturados },
    { value: "abonados", label: "Abonados", count: tabCounts.abonados },
    ...(tabCounts.sem_ajudante > 0
      ? [{ value: "sem_ajudante", label: "Sem ajudante", count: tabCounts.sem_ajudante }]
      : []),
  ];

  // Ranking nominal — respeita o mesmo filtro de data/busca já aplicado em
  // valesFiltered (o usuário escolhe o período nos campos de Data acima).
  const rankingAjudantes = sortRanking(calcularRankingAjudantes(valesFiltered), rankingSortField, rankingSortDir);

  function handleSortRanking(field: RankingSortField) {
    if (rankingSortField === field) {
      setRankingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingSortField(field);
      setRankingSortDir("desc");
    }
  }

  function exportRankingExcel() {
    const data = rankingAjudantes.map((r) => ({
      "Ajudante": r.nome,
      "Vales Gerados": r.totalGerados,
      "Valor Gerado": r.valorGerado,
      "Abonados": r.totalAbonados,
      "Valor Abonado": r.valorAbonado,
      "Faturados": r.totalFaturados,
      "Valor Faturado": r.valorFaturado,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ranking");
    XLSX.writeFile(wb, `vales-ranking-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportExcel() {
    const rows = sortVales(filterByTab(valesFiltered, activeTab), sortField, sortDir);
    const data = rows.map((v) => ({
      "Mapa": v.mapa ?? "",
      "Vale #": v.numero_vale,
      "Data Emissão": v.data_emissao ?? "",
      "Ajudante(s)": v.ajudantes.map((a) => a.nome).join(" / "),
      "Qtd Itens": v.itens.length,
      "Valor Total": v.valor_total ?? 0,
      "Status": v.status_vale ?? "Sem Ação",
      "Ação Transp.": v.acao_transportadora ?? "",
      "Ação Ambev": v.acao_primeiro_nivel ?? "",
      "Justificativa": v.justificativa_primeiro_nivel ?? "",
      "Notificado": v.notificacao_pendente_enviada ? "Sim" : "Não",
      "Motorista": v.motorista ?? "",
      "Veículo": v.veiculo ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 30 },
      { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 24 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vales");
    XLSX.writeFile(wb, `vales-${activeTab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="p-6 space-y-6">
      <ValeDetalhesModal
        vale={detalhesVale}
        open={!!detalhesVale}
        onClose={() => setDetalhesVale(null)}
      />

      {/* WhatsApp Preview Modal */}
      {previewVale && (
        <Dialog open={!!previewVale} onOpenChange={(o) => { if (!o) { setPreviewVale(null); setPreviewTemplate(null); setManualPhone(""); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                Preview — Notificação WhatsApp
              </DialogTitle>
              <DialogDescription>
                Vale #{previewVale.numero_vale} — confirme antes de enviar
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {previewTemplate === null ? (
                <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando mensagem configurada...
                </div>
              ) : ajudantesComTelefone.length > 0 ? (
                <div className="space-y-3">
                  {ajudantesComTelefone.map((aj) => (
                    <div key={aj.id} className="rounded-md border p-3 space-y-1.5">
                      <p className="text-sm font-medium">
                        {aj.nome}{" "}
                        <span className="text-muted-foreground font-normal">· {aj.telefone}</span>
                      </p>
                      <div className="bg-green-50 border border-green-200 rounded p-2.5">
                        <p className="text-sm text-green-900 leading-snug whitespace-pre-wrap">
                          {comLinkPendencias(buildMensagem(previewTemplate, {
                            nome: aj.nome,
                            qtd: "1",
                            vales: `#${previewVale.numero_vale}`,
                          }), linkPendenciasAtivo)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm text-blue-800">
                      {previewVale.ajudantes.length === 0
                        ? "Este vale não tem ajudante atribuído. "
                        : "Nenhum ajudante deste vale tem telefone cadastrado. "}
                      Digite o telefone para notificar — como o número não fica
                      gravado, enviamos uma mensagem padrão (sem o nome da pessoa).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="manual-phone" className="text-sm font-medium">
                      Telefone (WhatsApp)
                    </label>
                    <Input
                      id="manual-phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="(11) 91234-5678"
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                    />
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded p-2.5">
                    <p className="text-sm text-green-900 leading-snug whitespace-pre-wrap">
                      {comLinkPendencias(MENSAGEM_TELEFONE_MANUAL, linkPendenciasAtivo)}
                    </p>
                  </div>
                </div>
              )}
              {ajudantesSemTelefone.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sem telefone:{" "}{ajudantesSemTelefone.map((a) => a.nome).join(", ")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewVale(null)} disabled={!!notifyingId}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (ajudantesComTelefone.length > 0) {
                    sendNotificacao(previewVale.id, previewVale.numero_vale);
                  } else if (manualPhone.trim()) {
                    sendNotificacao(previewVale.id, previewVale.numero_vale, manualPhone.trim());
                  }
                }}
                disabled={
                  !!notifyingId ||
                  previewTemplate === null ||
                  (ajudantesComTelefone.length === 0 && !manualPhone.trim())
                }
                className="gap-2"
              >
                {notifyingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirmar e Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Atribuir Ajudante Modal */}
      {atribuirVale && (
        <Dialog open={!!atribuirVale} onOpenChange={(o) => { if (!o) { setAtribuirVale(null); setBuscaAtribuir(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Atribuir Ajudante</DialogTitle>
              <DialogDescription>
                Vale #{atribuirVale.numero_vale} — selecione o ajudante responsável
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por nome ou código..."
                  value={buscaAtribuir}
                  onChange={(e) => setBuscaAtribuir(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                {ajudantesAtribuirFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">Nenhum ajudante encontrado</p>
                ) : (
                  ajudantesAtribuirFiltrados.map((aj) => (
                    <button
                      key={aj.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between"
                      onClick={() => handleAtribuirAjudante(aj.id)}
                      disabled={atribuindo}
                    >
                      <div>
                        <p className="text-sm font-medium">{aj.nome}</p>
                        <p className="text-xs text-muted-foreground">Cód. {aj.codigo}</p>
                      </div>
                      {aj.telefone ? (
                        <span className="text-xs text-green-600">{aj.telefone}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem tel.</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAtribuirVale(null); setBuscaAtribuir(""); }}>
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Solicitar Fluxo Punitivo Modal */}
      {fluxoVale && (
        <Dialog open={!!fluxoVale} onOpenChange={(o) => { if (!o) setFluxoVale(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-indigo-600" />
                Solicitar Fluxo Punitivo
              </DialogTitle>
              <DialogDescription>
                Vale #{fluxoVale.numero_vale}{fluxoVale.mapa ? ` · Mapa ${fluxoVale.mapa}` : ""} · Motivo: GERAÇÃO DE VALE FISICO
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {fluxoVale.ajudantes.length === 0 ? (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">Este vale não tem ajudante atribuído. Atribua um ajudante antes de solicitar o fluxo.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Colaborador</label>
                    {fluxoVale.ajudantes.length === 1 ? (
                      <p className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">{fluxoVale.ajudantes[0].nome}</p>
                    ) : (
                      <select
                        value={fluxoAjudante}
                        onChange={(e) => setFluxoAjudante(e.target.value)}
                        className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {fluxoVale.ajudantes.map((a) => (
                          <option key={a.id} value={a.nome}>{a.nome}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Data da infração</label>
                    <input
                      type="date"
                      value={fluxoData}
                      onChange={(e) => setFluxoData(e.target.value)}
                      className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                    <p className="text-xs text-indigo-700 font-medium">Motivo fixo</p>
                    <p className="text-sm text-indigo-900 mt-0.5">GERAÇÃO DE VALE FISICO</p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFluxoVale(null)} disabled={solicitandoFluxo}>
                Cancelar
              </Button>
              <Button
                onClick={handleSolicitarFluxo}
                disabled={solicitandoFluxo || fluxoVale.ajudantes.length === 0 || !fluxoAjudante.trim()}
                className="gap-2"
              >
                {solicitandoFluxo ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                Solicitar Fluxo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Contestar Vale Modal */}
      {contestarVale && (
        <Dialog open={!!contestarVale} onOpenChange={(o) => { if (!o) { setContestarVale(null); setMotivoContestacao(""); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-orange-600" />
                Contestar Vale
              </DialogTitle>
              <DialogDescription>
                Vale #{contestarVale.numero_vale} — descreva o motivo pelo qual este vale faturado
                deveria ter sido abonado, para cobrança junto à Ambev.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Ex: Item foi entregue corretamente, divergência foi causada por erro de conferência..."
                value={motivoContestacao}
                onChange={(e) => setMotivoContestacao(e.target.value)}
                disabled={contestando}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setContestarVale(null); setMotivoContestacao(""); }} disabled={contestando}>
                Cancelar
              </Button>
              <Button onClick={handleContestar} disabled={!motivoContestacao.trim() || contestando} className="gap-2">
                {contestando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Salvar contestação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vales</h1>
          <p className="text-muted-foreground">Gerencie todos os vales do sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filteredVales.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            variant="outline"
            onClick={exportContestados}
            disabled={valesFiltered.filter((v) => v.contestado).length === 0}
          >
            <FileWarning className="h-4 w-4 mr-2" />
            Exportar Contestados
          </Button>
          <Button variant="outline" onClick={fetchVales} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Buscar por nº do vale, mapa, ajudante ou motorista..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={ajudanteFiltro} onValueChange={setAjudanteFiltro}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por ajudante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os ajudantes</SelectItem>
            {ajudantesList.map((aj) => (
              <SelectItem key={aj.id} value={aj.id}>
                {aj.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" className="w-36" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          <span className="text-muted-foreground text-sm">até</span>
          <Input type="date" className="w-36" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setDataInicio(""); setDataFim(""); setAjudanteFiltro("todos"); }} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {valesFiltered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Total</p>
            <p className="text-lg font-bold">{resumo.total}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorTotal)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Pendentes</p>
            <p className="text-lg font-bold text-yellow-600">{resumo.pendentes}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.total > 0 ? `${Math.round((resumo.pendentes / resumo.total) * 100)}%` : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Abonados</p>
            <p className="text-lg font-bold text-green-600">{resumo.abonados}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorAbonado)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Faturados</p>
            <p className="text-lg font-bold text-red-600">{resumo.faturados}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorFaturado)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label} ({tab.count})
            </TabsTrigger>
          ))}
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Ranking nominal</CardTitle>
                <CardDescription>
                  Por ajudante, no período selecionado nos campos de Data acima
                  {hasFilters && <span className="text-primary"> · filtro ativo</span>}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportRankingExcel} disabled={rankingAjudantes.length === 0} className="gap-2">
                <Download className="h-4 w-4" /> Exportar Excel
              </Button>
            </CardHeader>
            <CardContent>
              {rankingAjudantes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum vale com ajudante no período selecionado.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ajudante</TableHead>
                      {([
                        ["totalGerados", "Vales Gerados"],
                        ["valorGerado", "Valor Gerado"],
                        ["totalAbonados", "Abonados"],
                        ["valorAbonado", "Valor Abonado"],
                        ["totalFaturados", "Faturados"],
                        ["valorFaturado", "Valor Faturado"],
                      ] as [RankingSortField, string][]).map(([field, label]) => (
                        <TableHead key={field} className="text-right">
                          <button
                            onClick={() => handleSortRanking(field)}
                            className="flex items-center gap-1 ml-auto font-medium hover:text-foreground transition-colors"
                          >
                            {label}
                            {rankingSortField === field ? (
                              rankingSortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingAjudantes.map((r) => (
                      <TableRow key={r.nome}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalGerados}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.valorGerado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalAbonados}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.valorAbonado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalFaturados}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.valorFaturado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardHeader>
                <CardTitle>{tab.label}</CardTitle>
                <CardDescription>
                  {filterByTab(valesFiltered, tab.value).length} vale(s) encontrado(s)
                  {hasFilters && <span className="text-primary"> · filtro ativo</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tab.value === "pendentes" && (() => {
                  const semTratativa = filterByTab(valesFiltered, "pendentes")
                    .filter((v) => !v.acao_transportadora || v.acao_transportadora === "Sem ação");
                  const vencidos = semTratativa.filter((v) => calcPrazo(v.data_emissao)?.status === "vencido").length;
                  const urgentes = semTratativa.filter((v) => calcPrazo(v.data_emissao)?.status === "urgente").length;
                  if (!vencidos && !urgentes) return null;
                  return (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <span className="font-semibold">Atenção ao prazo de 3 dias! </span>
                        {vencidos > 0 && <span>{vencidos} vale{vencidos > 1 ? "s" : ""} com prazo <strong>vencido</strong>. </span>}
                        {urgentes > 0 && <span>{urgentes} vale{urgentes > 1 ? "s" : ""} vencem em <strong>menos de 24h</strong>. </span>}
                      </div>
                    </div>
                  );
                })()}
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Carregando...</span>
                  </div>
                ) : filteredVales.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {hasFilters ? "Nenhum vale encontrado com os filtros aplicados." : "Nenhum vale encontrado nesta categoria."}
                  </div>
                ) : (
                  <Table containerClassName="max-h-[70vh]">
                    <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background">
                      <TableRow>
                        <SortableHead field="mapa" label="Mapa" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="numero_vale" label="Vale #" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="data_emissao" label="Data" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <TableHead>Ajudante(s)</TableHead>
                        <SortableHead field="itens" label="Itens" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="valor_total" label="Valor Total" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="status_vale" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="prazo" label="Prazo" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <TableHead>Ação Transp.</TableHead>
                        <TableHead>Ação Ambev</TableHead>
                        <TableHead>Justificativa</TableHead>
                        <TableHead>Notificado</TableHead>
                        <TableHead className="sticky right-0 !z-30 bg-background text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVales.map((vale) => (
                        <TableRow key={vale.id}>
                          <TableCell className="text-muted-foreground">{vale.mapa ?? "—"}</TableCell>
                          <TableCell className="font-medium">#{vale.numero_vale}</TableCell>
                          <TableCell>{formatDateBR(vale.data_emissao)}</TableCell>
                          <TableCell className="max-w-[180px]">
                            {vale.ajudantes.length > 0 ? (
                              <div className="truncate">{vale.ajudantes.map((a) => a.nome).join(", ")}</div>
                            ) : (
                              <Badge variant="gray" className="text-xs">Sem ajudante</Badge>
                            )}
                          </TableCell>
                          <TableCell>{vale.itens.length}</TableCell>
                          <TableCell>{formatCurrency(vale.valor_total ?? 0)}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(vale.status_vale)}>
                              {vale.status_vale ?? "Sem Ação"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {vale.status_vale === "Sem Ação" && (!vale.acao_transportadora || vale.acao_transportadora === "Sem ação")
                              ? <PrazoBadge dataEmissao={vale.data_emissao} />
                              : <span className="text-muted-foreground text-sm">—</span>
                            }
                          </TableCell>
                          <TableCell>
                            {vale.acao_transportadora ? (
                              <Badge variant={getAcaoBadgeVariant(vale.acao_transportadora)}>
                                {vale.acao_transportadora}
                              </Badge>
                            ) : <span className="text-muted-foreground text-sm">-</span>}
                          </TableCell>
                          <TableCell>
                            {vale.acao_primeiro_nivel ? (
                              <Badge variant={
                                vale.acao_primeiro_nivel === "Aprovado" ? "success" :
                                vale.acao_primeiro_nivel === "Reprovado" ? "destructive" : "gray"
                              }>
                                {vale.acao_primeiro_nivel}
                              </Badge>
                            ) : <span className="text-muted-foreground text-sm">-</span>}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {vale.justificativa_primeiro_nivel ? (
                              <span className="text-sm truncate block" title={vale.justificativa_primeiro_nivel}>
                                {vale.justificativa_primeiro_nivel.length > 60
                                  ? vale.justificativa_primeiro_nivel.slice(0, 60) + "…"
                                  : vale.justificativa_primeiro_nivel}
                              </span>
                            ) : <span className="text-muted-foreground text-sm">-</span>}
                          </TableCell>
                          <TableCell>
                            {vale.notificacao_pendente_enviada ? (
                              <Badge variant="success">Sim</Badge>
                            ) : (
                              <Badge variant="gray">Não</Badge>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                            <Button variant="outline" size="sm" onClick={(e) => toggleAcoes(e, vale.id)}>
                              <MoreVertical className="h-4 w-4" />
                              <span className="ml-1 hidden sm:inline">Ações</span>
                            </Button>
                            {acoesAbertoId === vale.id && acoesPos && createPortal(
                              <div
                                ref={acoesMenuRef}
                                style={{ position: "fixed", top: acoesPos.top, left: acoesPos.left, transform: "translateX(-100%)" }}
                                className="z-50 w-48 rounded-md border bg-background shadow-lg py-1 text-left"
                              >
                                {vale.ajudantes.length === 0 && (
                                  <button
                                    onClick={() => { setAcoesAbertoId(null); setAtribuirVale(vale); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                                  >
                                    <UserPlus className="h-4 w-4" /> Atribuir ajudante
                                  </button>
                                )}
                                <button
                                  onClick={() => { setAcoesAbertoId(null); setDetalhesVale(vale); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                                >
                                  <Eye className="h-4 w-4" /> Detalhes
                                </button>
                                <button
                                  onClick={() => { setAcoesAbertoId(null); openPreview(vale); }}
                                  disabled={notifyingId === vale.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                                >
                                  {notifyingId === vale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                  Notificar
                                </button>
                                {linkPendenciasAtivo && (vale.status_vale === "Abonado" || vale.status_vale === "Faturado") && !vale.notificacao_final_enviada && (
                                  <button
                                    onClick={() => { setAcoesAbertoId(null); notificarResolucao(vale); }}
                                    disabled={notificandoResolucaoId === vale.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                                  >
                                    {notificandoResolucaoId === vale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                    Avisar resolução
                                  </button>
                                )}
                                {(vale.status_vale === "Faturado" || vale.status_vale === "Faturar") && (
                                  <button
                                    onClick={() => { setAcoesAbertoId(null); abrirSolicitarFluxo(vale); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 transition-colors"
                                  >
                                    <GitBranch className="h-4 w-4" /> Fluxo
                                  </button>
                                )}
                                {(vale.status_vale === "Faturado" || vale.status_vale === "Faturar") && (
                                  <button
                                    onClick={() => { setAcoesAbertoId(null); openContestar(vale); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-orange-50 transition-colors ${vale.contestado ? "text-orange-700" : ""}`}
                                  >
                                    <ShieldAlert className="h-4 w-4" /> {vale.contestado ? "Contestado" : "Contestar"}
                                  </button>
                                )}
                              </div>,
                              document.body
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
