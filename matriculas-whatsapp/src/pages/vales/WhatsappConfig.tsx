import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Search, Loader2, RefreshCw, Check, Copy, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { listarGrupos, type GrupoZApi } from "@/lib/zapi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function WhatsappConfigPage() {
  const { usuario } = useAuth();
  const filial = usuario?.filial ?? "";

  const [grupos, setGrupos] = useState<GrupoZApi[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  const [grupoAtual, setGrupoAtual] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Carrega o grupo de reposições já configurado para a filial do usuário
  const carregar = useCallback(async () => {
    if (!filial) { setCarregando(false); return; }
    setCarregando(true);
    const { data } = await supabase
      .from("filiais")
      .select("grupo_reposicoes_whatsapp")
      .eq("nome", filial)
      .maybeSingle();
    const atual = data?.grupo_reposicoes_whatsapp ?? null;
    setGrupoAtual(atual);
    setSelecionado(atual ?? "");
    setCarregando(false);
  }, [filial]);

  useEffect(() => { carregar(); }, [carregar]);

  async function buscarGrupos() {
    setBuscando(true);
    setErroBusca(null);
    const { grupos: gs, erro } = await listarGrupos();
    setBuscando(false);
    if (erro) { setErroBusca(erro); return; }
    if (gs.length === 0) { setErroBusca("Nenhum grupo encontrado nesta instância Z-API."); return; }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function salvar() {
    if (!filial) return;
    setSalvando(true);
    setSalvo(false);
    const valor = selecionado.trim() || null;
    await supabase
      .from("filiais")
      .update({ grupo_reposicoes_whatsapp: valor })
      .eq("nome", filial);
    setGrupoAtual(valor);
    setSalvando(false);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard indisponível */
    }
  }

  const gruposFiltrados = grupos.filter(
    (g) => !filtro || g.name.toLowerCase().includes(filtro.toLowerCase()) || g.phone.includes(filtro)
  );
  const alterado = (selecionado.trim() || null) !== grupoAtual;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" /> Configuração do WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Identifique o grupo do WhatsApp em que o número conectado está e defina qual é o
          grupo de <strong>reposições</strong> da filial {filial && <em>({filial})</em>}.
        </p>
      </div>

      {/* Grupo configurado atualmente */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">Grupo de reposições atual</span>
        </div>
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : grupoAtual ? (
          <p className="font-mono text-xs break-all text-gray-700">{grupoAtual}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum grupo configurado. Busque os grupos abaixo e selecione um.
          </p>
        )}
      </div>

      {/* Buscar grupos no Z-API */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Grupos do número conectado</span>
          <button
            onClick={buscarGrupos}
            disabled={buscando}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {buscando ? "Buscando…" : grupos.length > 0 ? "Atualizar" : "Buscar grupos (Z-API)"}
          </button>
        </div>

        {erroBusca && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="break-all">{erroBusca}</span>
          </div>
        )}

        {grupos.length > 0 && (
          <>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nome ou ID…"
              className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
              {gruposFiltrados.map((g) => {
                const ativo = selecionado === g.phone;
                return (
                  <div
                    key={g.phone}
                    className={`flex items-center gap-3 px-3 py-2.5 ${ativo ? "bg-primary/5" : "hover:bg-muted/40"} transition-colors`}
                  >
                    <button
                      onClick={() => setSelecionado(ativo ? "" : g.phone)}
                      className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${ativo ? "bg-primary border-primary text-white" : "border-gray-300"}`}
                      title={ativo ? "Selecionado como grupo de reposições" : "Definir como grupo de reposições"}
                    >
                      {ativo && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{g.phone}</p>
                    </div>
                    <button
                      onClick={() => copiar(g.phone)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent transition-colors shrink-0"
                      title="Copiar ID do grupo"
                    >
                      {copiado === g.phone ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiado === g.phone ? "Copiado" : "Copiar ID"}
                    </button>
                  </div>
                );
              })}
              {gruposFiltrados.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhum grupo corresponde ao filtro.</p>
              )}
            </div>
          </>
        )}

        {/* Entrada manual do ID do grupo */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Ou cole o ID do grupo manualmente
          </label>
          <input
            value={selecionado}
            onChange={(e) => setSelecionado(e.target.value)}
            placeholder="Ex: 120363019502650977-group"
            className="w-full px-3 py-2 text-sm font-mono border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          {salvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
          <button
            onClick={salvar}
            disabled={salvando || !alterado || !filial}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {salvando ? "Salvando…" : "Salvar grupo de reposições"}
          </button>
        </div>
      </div>
    </div>
  );
}
