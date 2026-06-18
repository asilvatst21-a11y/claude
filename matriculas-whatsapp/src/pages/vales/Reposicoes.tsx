import React, { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Clock, Package, RefreshCw, FileSpreadsheet, Send, ClipboardCheck, ChevronDown, ChevronUp, ShoppingCart, Upload, Loader2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/valesUtils";
import { valesSupabase } from "@/lib/valesSupabase";
import { enviarBotoesGrupo } from "@/lib/zapi";

type Status = "pendente" | "validado" | "negado" | "quebra" | "registrado";

interface Reposicao {
  id: string;
  numero: string;
  filial: string | null;
  motorista_nome: string | null;
  motorista_telefone: string | null;
  mapa: string | null;
  cliente: string | null;
  codigo_pdv: string | null;
  produto: string | null;
  quantidade: string | null;
  tipo_reposicao: string | null;
  embalagem: string | null;
  motivo: string | null;
  mensagem_original: string | null;
  status: Status;
  validador_resposta: string | null;
  validado_em: string | null;
  created_at: string;
  cora_solicitacao_id: string | null;
  cora_status: string | null;
  cora_motivo_reprovacao: string | null;
  cora_pedido_reposicao: string | null;
  cora_nf: string | null;
  cora_data_acao: string | null;
  cora_importado_em: string | null;
}

const TIPO_REPOSICAO_LABEL: Record<string, string> = {
  falta: "Falta",
  inversao: "Inversão",
  avaria: "Avaria",
  troca: "Troca",
  indefinido: "Não informado",
};

const EMBALAGEM_LABEL: Record<string, string> = {
  unidade: "Unidade",
  fardo: "Fardo",
  indefinido: "Não informado",
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: "Pendente", color: "text-yellow-600 bg-yellow-50", icon: Clock },
  validado: { label: "Validado", color: "text-green-600 bg-green-50", icon: CheckCircle },
  negado: { label: "Negado", color: "text-red-600 bg-red-50", icon: XCircle },
  quebra: { label: "Quebra", color: "text-orange-600 bg-orange-50", icon: AlertTriangle },
  registrado: { label: "Registrado no sistema", color: "text-blue-600 bg-blue-50", icon: ClipboardCheck },
};

const TABS: { value: "todos" | Status; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "validado", label: "Validados" },
  { value: "registrado", label: "Registrados" },
  { value: "negado", label: "Negados" },
];

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(str: string | null) {
  if (!str) return "—";
  return new Date(str).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface VendaDia {
  produto_codigo: number | null;
  produto_nome: string | null;
  quantidade: number | null;
  unidade: string | null;
}

// Extrai o código numérico do campo de produto ou PDV (ex: "8919 - GUARANA..." → 8919)
function extrairCodigo(campo: string | null): number | null {
  if (!campo) return null;
  const m = campo.match(/^\s*(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// ── Importação do arquivo do CORA (Ambev) ──────────────────────────────────────
// Normaliza um número de mapa para comparação (só dígitos, sem zeros à esquerda).
function normMapa(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

// Remove acentos/pontuação e baixa caixa, para casar nomes de coluna mesmo que
// o arquivo do CORA venha com encoding ou espaçamento levemente diferente.
function normalizarCabecalho(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface CoraRow {
  solicitacaoId: string;
  status: string;
  mapa: string;
  produtoCodigo: string;
  quantidade: string;
  motivoReprovacao: string;
  pedidoReposicao: string;
  nf: string;
  dataAcao: string;
}

const CORA_COLUNAS: Record<string, keyof CoraRow> = {
  "solicitacao reposicao": "solicitacaoId",
  "status solicitacao": "status",
  "mapa origem": "mapa",
  "produto": "produtoCodigo",
  "quantidade": "quantidade",
  "motivo da reprovacao": "motivoReprovacao",
  "nr pedido reposicao": "pedidoReposicao",
  "nf": "nf",
  "data acao": "dataAcao",
};

// Lê o arquivo do CORA — aceita .csv (separado por ";", padrão da exportação)
// ou .xlsx/.xls (mesmas colunas, planilha).
async function parseArquivoCora(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }
  const text = await file.text();
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(";"));
}

function parseCoraRows(linhas: string[][]): CoraRow[] {
  if (linhas.length < 2) return [];
  const idxPorCampo: Partial<Record<keyof CoraRow, number>> = {};
  linhas[0].forEach((cabecalho, i) => {
    const campo = CORA_COLUNAS[normalizarCabecalho(cabecalho)];
    if (campo) idxPorCampo[campo] = i;
  });
  const get = (row: string[], campo: keyof CoraRow): string => {
    const i = idxPorCampo[campo];
    return i == null ? "" : String(row[i] ?? "").trim();
  };
  return linhas
    .slice(1)
    .map((row) => ({
      solicitacaoId: get(row, "solicitacaoId"),
      status: get(row, "status"),
      mapa: get(row, "mapa"),
      produtoCodigo: get(row, "produtoCodigo"),
      quantidade: get(row, "quantidade"),
      motivoReprovacao: get(row, "motivoReprovacao"),
      pedidoReposicao: get(row, "pedidoReposicao"),
      nf: get(row, "nf"),
      dataAcao: get(row, "dataAcao"),
    }))
    .filter((r) => r.solicitacaoId);
}

interface ImportCoraResumo {
  vinculadas: number;
  atualizadas: number;
  naoEncontradas: { solicitacaoId: string; mapa: string; produto: string }[];
}

// Casa cada linha do CORA com uma reposição nossa (por Mapa + código do Produto).
// Reimportações do mesmo arquivo (ou de um arquivo mais novo) atualizam o status
// do CORA nas reposições já vinculadas em vez de tentar casar de novo.
async function importarArquivoCora(file: File): Promise<ImportCoraResumo> {
  const linhas = await parseArquivoCora(file);
  const coraRows = parseCoraRows(linhas);
  if (coraRows.length === 0) {
    throw new Error("Nenhuma linha reconhecida no arquivo. Verifique se é a exportação do CORA.");
  }

  const { data: todas, error } = await valesSupabase
    .from("reposicoes")
    .select("id, mapa, produto, status, cora_solicitacao_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const reps = todas ?? [];

  const linkadas = new Map<string, (typeof reps)[number]>();
  for (const r of reps) {
    if (!r.cora_solicitacao_id) continue;
    linkadas.set(`${r.cora_solicitacao_id}::${extrairCodigo(r.produto) ?? ""}`, r);
  }
  const naoLinkadas = reps.filter((r) => !r.cora_solicitacao_id);

  let vinculadas = 0;
  let atualizadas = 0;
  const naoEncontradas: ImportCoraResumo["naoEncontradas"] = [];
  const agora = new Date().toISOString();

  for (const linha of coraRows) {
    const codigoProduto = parseInt(linha.produtoCodigo.replace(/\D/g, "")) || null;
    const camposCora = {
      cora_status: linha.status || null,
      cora_motivo_reprovacao: linha.motivoReprovacao || null,
      cora_pedido_reposicao: linha.pedidoReposicao || null,
      cora_nf: linha.nf || null,
      cora_data_acao: linha.dataAcao || null,
      cora_importado_em: agora,
    };

    const jaLinkada = linkadas.get(`${linha.solicitacaoId}::${codigoProduto ?? ""}`);
    if (jaLinkada) {
      const { error: errAtualiza } = await valesSupabase.from("reposicoes").update(camposCora).eq("id", jaLinkada.id);
      if (errAtualiza) throw new Error(`Falha ao atualizar a solicitação ${linha.solicitacaoId}: ${errAtualiza.message}`);
      atualizadas++;
      continue;
    }

    const mapaAlvo = normMapa(linha.mapa);
    const candidatos = mapaAlvo
      ? naoLinkadas.filter((r) => normMapa(r.mapa) === mapaAlvo && codigoProduto != null && extrairCodigo(r.produto) === codigoProduto)
      : [];

    // Mapa + produto pode bater com mais de uma reposição (ex.: o mesmo
    // problema relatado mais de uma vez) — usa a mais recente ainda não
    // vinculada em vez de descartar o casamento.
    if (candidatos.length >= 1) {
      const rep = candidatos[0];
      const novoStatus = rep.status === "pendente" || rep.status === "validado" ? "registrado" : rep.status;
      const { error: errVincula } = await valesSupabase
        .from("reposicoes")
        .update({ ...camposCora, status: novoStatus, cora_solicitacao_id: linha.solicitacaoId })
        .eq("id", rep.id);
      if (errVincula) throw new Error(`Falha ao vincular a solicitação ${linha.solicitacaoId}: ${errVincula.message}`);
      naoLinkadas.splice(naoLinkadas.indexOf(rep), 1);
      vinculadas++;
    } else {
      naoEncontradas.push({ solicitacaoId: linha.solicitacaoId, mapa: linha.mapa, produto: linha.produtoCodigo });
    }
  }

  return { vinculadas, atualizadas, naoEncontradas };
}

const CORA_STATUS_COLOR: Record<string, string> = {
  Pendente: "text-yellow-600 bg-yellow-50",
  Aprovada: "text-green-600 bg-green-50",
  Reprovada: "text-red-600 bg-red-50",
};

function CoraStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const color = CORA_STATUS_COLOR[status] ?? "text-gray-600 bg-gray-50";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>;
}

function VendasConfronto({ rep }: { rep: Reposicao }) {
  const [vendas, setVendas] = useState<VendaDia[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const buscouRef = useRef(false);

  useEffect(() => {
    if (buscouRef.current) return;
    buscouRef.current = true;
    const pdvCod = extrairCodigo(rep.codigo_pdv ?? rep.cliente);
    if (!pdvCod) { setVendas([]); return; }
    setCarregando(true);
    // Usa a data mais recente importada (o CSV diário traz a data do arquivo)
    (async () => {
      const { data: ultima } = await valesSupabase
        .from("vendas_dia")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ultima?.data) { setVendas([]); setCarregando(false); return; }
      const { data: rows } = await valesSupabase
        .from("vendas_dia")
        .select("produto_codigo, produto_nome, quantidade, unidade")
        .eq("data", ultima.data)
        .eq("pdv_codigo", pdvCod)
        .order("produto_codigo");
      setVendas(rows ?? []);
      setCarregando(false);
    })();
  }, [rep]);

  const prodCod = extrairCodigo(rep.produto);
  const temProduto = prodCod && vendas?.some(v => v.produto_codigo === prodCod);

  if (carregando) return <div className="text-xs text-muted-foreground mt-2">Buscando vendas do dia…</div>;
  if (!vendas || vendas.length === 0) {
    const pdvCod = extrairCodigo(rep.codigo_pdv ?? rep.cliente);
    if (!pdvCod) return null;
    return <div className="text-xs text-muted-foreground mt-2">Nenhuma venda encontrada para o PDV {pdvCod} em {rep.created_at.slice(0, 10)}.</div>;
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShoppingCart className="h-3.5 w-3.5" />
        Vendas do dia para este PDV — {rep.created_at.slice(0, 10)}
        {temProduto
          ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">produto confirmado no pedido ✓</span>
          : prodCod
          ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">produto NÃO encontrado no pedido ⚠</span>
          : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
        {vendas.map((v, i) => (
          <div key={i} className={`text-xs px-2 py-1 rounded border ${v.produto_codigo === prodCod ? "border-green-300 bg-green-50 font-medium text-green-800" : "border-transparent bg-muted/30 text-muted-foreground"}`}>
            {v.produto_codigo} — {v.produto_nome ?? "?"} {v.quantidade ? `(${v.quantidade} ${v.unidade ?? ""})` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReposicoesPage() {
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);
  const [tab, setTab] = useState<"todos" | Status>("todos");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [coraModalOpen, setCoraModalOpen] = useState(false);
  const [coraImportando, setCoraImportando] = useState(false);
  const [coraResumo, setCoraResumo] = useState<ImportCoraResumo | null>(null);
  const [coraErro, setCoraErro] = useState<string | null>(null);
  const coraFileInputRef = useRef<HTMLInputElement>(null);

  // suppress unused import warning
  void formatCurrency;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = valesSupabase.from("reposicoes").select("*").order("created_at", { ascending: false });
    if (tab !== "todos") query = query.eq("status", tab);
    const { data } = await query;
    setReposicoes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Marca como "Registrado no sistema" (registrado no sistema Ambev p/ envio do produto)
  async function marcarRegistrado(rep: Reposicao) {
    setActionLoading(rep.id + "registrado");
    const { error } = await valesSupabase.from("reposicoes").update({ status: "registrado" }).eq("id", rep.id);
    setActionLoading(null);
    if (error) { alert(`Falha ao confirmar o registro:\n${error.message}`); return; }
    await fetchData();
  }

  // Reenvia a reposição para o grupo de validação no WhatsApp (controle responde OK/NOK)
  async function enviarParaValidacao(rep: Reposicao) {
    if (!rep.filial) {
      alert("Esta reposição não tem filial registrada, não dá para localizar o grupo de validação.");
      return;
    }
    setActionLoading(rep.id + "envio-validacao");
    const { data: f } = await valesSupabase
      .from("filiais")
      .select("grupo_validacao_whatsapp")
      .eq("nome", rep.filial)
      .maybeSingle();
    const grupo = (f as { grupo_validacao_whatsapp?: string | null } | null)?.grupo_validacao_whatsapp;
    if (!grupo) {
      setActionLoading(null);
      alert(`Nenhum grupo de validação configurado para a filial "${rep.filial}". Configure em Config. WhatsApp.`);
      return;
    }
    const linhas = [
      `🔎 *Validação de Reposição* — ${rep.numero}`,
      `🔁 Tipo: ${TIPO_REPOSICAO_LABEL[rep.tipo_reposicao ?? "indefinido"] ?? "Não informado"}`,
      `📦 Embalagem: ${EMBALAGEM_LABEL[rep.embalagem ?? "indefinido"] ?? "Não informado"}`,
    ];
    if (rep.motorista_nome) linhas.push(`👤 Motorista: ${rep.motorista_nome}`);
    if (rep.codigo_pdv) linhas.push(`🏪 PDV: ${rep.codigo_pdv}`);
    if (rep.mapa) linhas.push(`🗺️ Mapa: ${rep.mapa}`);
    if (rep.produto) linhas.push(`📋 Produto: ${rep.produto}`);
    if (rep.quantidade) linhas.push(`📊 Qtde: ${rep.quantidade}`);
    linhas.push("\nValidar? Toque em *OK* / *NOK* ou responda *OK* para aprovar ou *NOK* para negar.");
    const { sucesso, erro } = await enviarBotoesGrupo(grupo, linhas.join("\n"), [
      { id: `vok:${rep.id}`, label: "✅ OK" },
      { id: `vnok:${rep.id}`, label: "❌ NOK" },
    ]);
    if (sucesso && rep.status !== "pendente") {
      await valesSupabase.from("reposicoes").update({ status: "pendente" }).eq("id", rep.id);
    }
    setActionLoading(null);
    if (!sucesso) { alert(`Falha ao enviar para o grupo de validação:\n${erro ?? ""}`); return; }
    await fetchData();
    alert("Enviado para o grupo de validação no WhatsApp.");
  }

  async function handleArquivoCora(file: File) {
    setCoraImportando(true);
    setCoraErro(null);
    setCoraResumo(null);
    try {
      const resumo = await importarArquivoCora(file);
      setCoraResumo(resumo);
      // Itens confirmados podem ter saído do status da aba atual (ex.: de
      // Pendente para Registrado), então troca para "Todos" e busca os dados
      // direto, sem depender do filtro de aba que estava ativo antes do import.
      setTab("todos");
      const { data } = await valesSupabase
        .from("reposicoes")
        .select("*")
        .order("created_at", { ascending: false });
      setReposicoes(Array.isArray(data) ? data : []);
    } catch (err) {
      setCoraErro(err instanceof Error ? err.message : "Erro ao importar o arquivo");
    } finally {
      setCoraImportando(false);
      if (coraFileInputRef.current) coraFileInputRef.current.value = "";
    }
  }

  function fecharModalCora() {
    setCoraModalOpen(false);
    setCoraResumo(null);
    setCoraErro(null);
  }

  function exportExcel() {
    if (!reposicoes.length) return;
    const rows = reposicoes.map((r) => ({
      "Número": r.numero,
      "Data": formatDate(r.created_at),
      "Filial": r.filial ?? "",
      "Motorista": r.motorista_nome ?? "",
      "Telefone": r.motorista_telefone ?? "",
      "Tipo": TIPO_REPOSICAO_LABEL[r.tipo_reposicao ?? ""] ?? r.tipo_reposicao ?? "",
      "Embalagem": EMBALAGEM_LABEL[r.embalagem ?? ""] ?? r.embalagem ?? "",
      "PDV": r.codigo_pdv ?? "",
      "Cliente": r.cliente ?? "",
      "Mapa": r.mapa ?? "",
      "Produto": r.produto ?? "",
      "Quantidade": r.quantidade ?? "",
      "Status": STATUS_CONFIG[r.status]?.label ?? r.status,
      "Validado em": r.validado_em ? formatDate(r.validado_em) : "",
      "Resposta": r.validador_resposta ?? "",
      "Solicitação CORA": r.cora_solicitacao_id ?? "",
      "Status CORA": r.cora_status ?? "",
      "Motivo Reprovação CORA": r.cora_motivo_reprovacao ?? "",
      "Mensagem original": r.mensagem_original ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reposições");
    XLSX.writeFile(wb, `reposicoes_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  const stats = {
    total: reposicoes.length,
    pendente: reposicoes.filter((r) => r.status === "pendente").length,
    validado: reposicoes.filter((r) => r.status === "validado").length,
    negado: reposicoes.filter((r) => r.status === "negado").length,
  };

  // Botões de ação (reutilizados na tabela e nos cartões do mobile)
  function Acoes({ r }: { r: Reposicao }) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {(r.status === "pendente" || r.status === "negado") && (
          <button onClick={() => enviarParaValidacao(r)} disabled={!!actionLoading} title="Reenvia para o grupo de validação no WhatsApp" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 transition-colors">
            <Send className="h-3 w-3" />{actionLoading === r.id + "envio-validacao" ? "..." : "Enviar p/ validação"}
          </button>
        )}
        {(r.status === "pendente" || r.status === "validado") && (
          <button onClick={() => marcarRegistrado(r)} disabled={!!actionLoading} title="Confirma que foi registrado no sistema Ambev para envio do produto" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition-colors">
            <ClipboardCheck className="h-3 w-3" />{actionLoading === r.id + "registrado" ? "..." : "Confirmar registro"}
          </button>
        )}
        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="p-1 rounded hover:bg-accent transition-colors">
          {expanded === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  // Detalhe expandido (reutilizado na tabela e nos cartões do mobile)
  function Detalhe({ r }: { r: Reposicao }) {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
          <div><span className="text-xs text-muted-foreground block mb-0.5">Cliente</span><span className="font-medium">{r.cliente ?? "—"}</span></div>
          <div><span className="text-xs text-muted-foreground block mb-0.5">Motivo</span><span className="font-medium">{r.motivo ?? "—"}</span></div>
          {r.validado_em && <div><span className="text-xs text-muted-foreground block mb-0.5">Validado em</span><span className="font-medium">{formatDate(r.validado_em)}</span></div>}
          {r.validador_resposta && <div><span className="text-xs text-muted-foreground block mb-0.5">Resposta</span><span className="font-medium">{r.validador_resposta}</span></div>}
          {r.cora_solicitacao_id && <div><span className="text-xs text-muted-foreground block mb-0.5">Solicitação CORA</span><span className="font-medium">{r.cora_solicitacao_id}</span></div>}
          {r.cora_motivo_reprovacao && <div><span className="text-xs text-muted-foreground block mb-0.5">Motivo Reprovação CORA</span><span className="font-medium">{r.cora_motivo_reprovacao}</span></div>}
        </div>
        {r.mensagem_original && r.mensagem_original !== "[áudio]" && (
          <div className="text-xs text-muted-foreground border-l-2 pl-3 italic">&ldquo;{r.mensagem_original}&rdquo;</div>
        )}
        <VendasConfronto rep={r} />
      </>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Reposições</h1>
          <p className="text-sm text-muted-foreground">Solicitações via WhatsApp normalizadas por IA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Atualizar</span>
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <FileSpreadsheet className="h-4 w-4" />Excel
          </button>
          <button onClick={() => setCoraModalOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <Upload className="h-4 w-4" />Importar CORA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total", value: stats.total, icon: Package, color: "text-primary" },
          { label: "Pendentes", value: stats.pendente, icon: Clock, color: "text-yellow-600" },
          { label: "Validados", value: stats.validado, icon: CheckCircle, color: "text-green-600" },
          { label: "Negados", value: stats.negado, icon: XCircle, color: "text-red-600" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border bg-white p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">Carregando...</div>
      ) : reposicoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Package className="h-10 w-10 opacity-20 mb-3" />
          <p>Nenhuma reposição encontrada</p>
        </div>
      ) : (
        <>
        {/* Desktop: tabela */}
        <div className="border rounded-lg overflow-hidden hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Número</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motorista</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">PDV</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status CORA</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reposicoes.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{r.numero}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div>{r.motorista_nome ?? "—"}</div>
                      {r.motorista_telefone && <div className="text-xs text-muted-foreground">{r.motorista_telefone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {r.tipo_reposicao ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {TIPO_REPOSICAO_LABEL[r.tipo_reposicao] ?? r.tipo_reposicao}
                        </span>
                      ) : "—"}
                      {r.embalagem && r.embalagem !== "indefinido" && (
                        <div className="text-xs text-muted-foreground mt-0.5">{EMBALAGEM_LABEL[r.embalagem] ?? r.embalagem}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.produto ?? "—"}</div>
                      {r.quantidade && <div className="text-xs text-muted-foreground">{r.quantidade}</div>}
                    </td>
                    <td className="px-4 py-3">{r.codigo_pdv ?? r.cliente ?? "—"}</td>
                    <td className="px-4 py-3">{r.mapa ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3"><CoraStatusBadge status={r.cora_status} /></td>
                    <td className="px-4 py-3"><Acoes r={r} /></td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={10} className="px-4 py-4"><Detalhe r={r} /></td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cartões */}
        <div className="md:hidden space-y-3">
          {reposicoes.map((r) => (
            <div key={r.id} className="border rounded-lg bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{r.numero}</span>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  {r.cora_status && <CoraStatusBadge status={r.cora_status} />}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(r.created_at)}</div>
              <div className="font-medium text-sm">{r.produto ?? "—"}{r.quantidade ? ` · ${r.quantidade}` : ""}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {r.tipo_reposicao && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {TIPO_REPOSICAO_LABEL[r.tipo_reposicao] ?? r.tipo_reposicao}
                    {r.embalagem && r.embalagem !== "indefinido" ? ` · ${EMBALAGEM_LABEL[r.embalagem] ?? r.embalagem}` : ""}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-xs text-muted-foreground block">PDV</span>{r.codigo_pdv ?? r.cliente ?? "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Mapa</span>{r.mapa ?? "—"}</div>
                <div className="col-span-2"><span className="text-xs text-muted-foreground block">Motorista</span>{r.motorista_nome ?? "—"}</div>
              </div>
              <div className="pt-1 border-t"><Acoes r={r} /></div>
              {expanded === r.id && <div className="pt-1 border-t"><Detalhe r={r} /></div>}
            </div>
          ))}
        </div>
        </>
      )}

      {coraModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Importar arquivo do CORA</h2>
              <button onClick={fecharModalCora} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Selecione o arquivo exportado do CORA (.csv, .xlsx ou .xls). As solicitações serão
              comparadas com as reposições pendentes e os registros correspondentes serão
              confirmados automaticamente, além de terem o status do CORA atualizado.
            </p>

            <input
              ref={coraFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleArquivoCora(file);
              }}
            />

            <button
              onClick={() => coraFileInputRef.current?.click()}
              disabled={coraImportando}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md border-2 border-dashed text-sm hover:bg-accent transition-colors disabled:opacity-60"
            >
              {coraImportando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />Selecionar arquivo
                </>
              )}
            </button>

            {coraErro && (
              <div className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{coraErro}</div>
            )}

            {coraResumo && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-green-50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Vinculadas agora</div>
                    <div className="text-lg font-semibold text-green-700">{coraResumo.vinculadas}</div>
                  </div>
                  <div className="rounded-md bg-blue-50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Status atualizados</div>
                    <div className="text-lg font-semibold text-blue-700">{coraResumo.atualizadas}</div>
                  </div>
                </div>

                {coraResumo.naoEncontradas.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">
                      Não encontradas no sistema ({coraResumo.naoEncontradas.length})
                    </div>
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                      {coraResumo.naoEncontradas.map((n, i) => (
                        <div key={`${n.solicitacaoId}-${i}`} className="px-3 py-1.5 text-xs flex justify-between gap-2">
                          <span className="font-mono">{n.solicitacaoId}</span>
                          <span className="text-muted-foreground">Mapa {n.mapa || "—"} · Produto {n.produto || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={fecharModalCora} className="px-4 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
