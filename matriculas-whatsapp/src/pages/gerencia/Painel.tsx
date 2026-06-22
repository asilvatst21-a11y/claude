import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Loader2, TrendingDown, TrendingUp, Search, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { MESES_LABEL, MESES_ORDEM } from "@/lib/gerenciaDreTypes";
import type { GerenciaDreConta, GerenciaDreLancamento } from "@/lib/gerenciaDreTypes";

function ContaArvoreNo({
  conta, sinal, contasPorCodigo, lancamentosDoMes, nivel, caminho, expandidos, onToggle,
}: {
  conta: GerenciaDreConta;
  sinal: "+" | "-";
  contasPorCodigo: Map<string, GerenciaDreConta>;
  lancamentosDoMes: Map<string, GerenciaDreLancamento>;
  nivel: number;
  caminho: string;
  expandidos: Set<string>;
  onToggle: (caminho: string) => void;
}) {
  const filhos = conta.formula_componentes ?? [];
  const temFilhos = filhos.length > 0;
  const aberto = expandidos.has(caminho);
  const lancamento = lancamentosDoMes.get(conta.conta_codigo);

  return (
    <>
      <TableRow>
        <TableCell style={{ paddingLeft: `${12 + nivel * 20}px` }}>
          <div className="flex items-center gap-1.5">
            {temFilhos ? (
              <button onClick={() => onToggle(caminho)} className="p-0.5 rounded hover:bg-accent shrink-0">
                {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            {sinal === "-" && <span className="text-red-600 font-semibold">−</span>}
            <span className={temFilhos ? "font-medium" : ""}>{conta.conta_codigo} | {conta.conta_nome}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">{formatNumero(lancamento?.realizado)}</TableCell>
      </TableRow>
      {temFilhos && aberto && filhos.map((comp) => {
        const filho = contasPorCodigo.get(comp.codigo);
        if (!filho) return null;
        const proximoCaminho = `${caminho}/${comp.codigo}`;
        return (
          <ContaArvoreNo
            key={proximoCaminho}
            conta={filho}
            sinal={comp.sinal}
            contasPorCodigo={contasPorCodigo}
            lancamentosDoMes={lancamentosDoMes}
            nivel={nivel + 1}
            caminho={proximoCaminho}
            expandidos={expandidos}
            onToggle={onToggle}
          />
        );
      })}
    </>
  );
}

function formatNumero(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function formatPercentual(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return `${(v * 100).toFixed(2)}%`;
}

export default function GerenciaPainelPage() {
  const [carregando, setCarregando] = useState(true);
  const [contas, setContas] = useState<GerenciaDreConta[]>([]);
  const [lancamentos, setLancamentos] = useState<GerenciaDreLancamento[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<string>("JANEIRO");
  const [mesA, setMesA] = useState<string>("JANEIRO");
  const [mesB, setMesB] = useState<string>("FEVEREIRO");
  const [contaComparativoId, setContaComparativoId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [estruturaExpandidos, setEstruturaExpandidos] = useState<Set<string>>(new Set());

  const toggleEstrutura = (caminho: string) => {
    setEstruturaExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(caminho)) next.delete(caminho);
      else next.add(caminho);
      return next;
    });
  };

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const [{ data: contasData }, { data: anosData }] = await Promise.all([
        supabase.from("gerencia_dre_contas").select("*").order("ordem"),
        supabase.from("gerencia_dre_lancamentos").select("ano").order("ano", { ascending: false }),
      ]);
      setContas(Array.isArray(contasData) ? contasData : []);
      const anosUnicos = Array.from(new Set((anosData ?? []).map((r) => r.ano as number)));
      setAnos(anosUnicos);
      if (anosUnicos.length > 0) setAno(anosUnicos[0]);
      setCarregando(false);
    }
    carregar();
  }, []);

  useEffect(() => {
    if (!ano) return;
    supabase
      .from("gerencia_dre_lancamentos")
      .select("*")
      .eq("ano", ano)
      .then(({ data }) => setLancamentos(Array.isArray(data) ? data : []));
  }, [ano]);

  const mesesDisponiveis = useMemo(() => {
    const presentes = new Set(lancamentos.map((l) => l.mes));
    return MESES_ORDEM.filter((m) => presentes.has(m));
  }, [lancamentos]);

  const mesEfetivo = mesesDisponiveis.includes(mes) ? mes : (mesesDisponiveis[0] ?? mes);

  const lancamentosPorMes = useMemo(() => {
    const map = new Map<string, Map<string, GerenciaDreLancamento>>();
    for (const l of lancamentos) {
      if (!map.has(l.mes)) map.set(l.mes, new Map());
      map.get(l.mes)!.set(l.conta_codigo, l);
    }
    return map;
  }, [lancamentos]);

  const contasComMeta = useMemo(() => contas.filter((c) => c.meta_avr !== null), [contas]);

  const contasPorCodigo = useMemo(() => new Map(contas.map((c) => [c.conta_codigo, c])), [contas]);

  const raizesEstrutura = useMemo(() => {
    const referenciadas = new Set<string>();
    for (const c of contas) {
      for (const comp of c.formula_componentes ?? []) referenciadas.add(comp.codigo);
    }
    return contas.filter((c) => !referenciadas.has(c.conta_codigo));
  }, [contas]);

  const lancamentosDoMesEstrutura = useMemo(
    () => lancamentosPorMes.get(mesEfetivo) ?? new Map<string, GerenciaDreLancamento>(),
    [lancamentosPorMes, mesEfetivo]
  );

  const metasLinhas = useMemo(() => {
    const doMes = lancamentosPorMes.get(mesEfetivo);
    if (!doMes) return [];
    return contasComMeta
      .map((c) => {
        const l = doMes.get(c.conta_codigo);
        if (!l) return null;
        const metaAbs = Math.abs(c.meta_avr ?? 0);
        const realAbs = Math.abs(l.avr_percentual ?? 0);
        return { conta: c, lancamento: l, dentroDaMeta: realAbs <= metaAbs, gapPontos: (realAbs - metaAbs) * 100 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.gapPontos - a.gapPontos);
  }, [contasComMeta, lancamentosPorMes, mesEfetivo]);

  const contasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contas;
    return contas.filter((c) => c.conta_nome.toLowerCase().includes(termo) || c.conta_codigo.includes(termo));
  }, [contas, busca]);

  const contaComparativo = useMemo(() => contas.find((c) => c.conta_codigo === contaComparativoId) ?? null, [contas, contaComparativoId]);

  const serieComparativo = useMemo(() => {
    if (!contaComparativo) return [];
    return mesesDisponiveis.map((m) => {
      const l = lancamentosPorMes.get(m)?.get(contaComparativo.conta_codigo);
      return {
        mes: MESES_LABEL[m] ?? m,
        Realizado: l?.realizado ?? 0,
        Remunerado: l?.remunerado ?? 0,
      };
    });
  }, [contaComparativo, mesesDisponiveis, lancamentosPorMes]);

  const ranking = useMemo(() => {
    const doA = lancamentosPorMes.get(mesA);
    const doB = lancamentosPorMes.get(mesB);
    if (!doA || !doB) return [];
    return contas
      .map((c) => {
        const lA = doA.get(c.conta_codigo);
        const lB = doB.get(c.conta_codigo);
        if (!lA || !lB) return null;
        const delta = lB.realizado - lA.realizado;
        return { conta: c, realizadoA: lA.realizado, realizadoB: lB.realizado, delta };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && Math.abs(x.delta) > 0.01);
  }, [contas, lancamentosPorMes, mesA, mesB]);

  const maioresVariacoes = useMemo(
    () => [...ranking].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    [ranking]
  );

  if (carregando) {
    return <div className="p-6 flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;
  }

  if (!ano) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Gerência — DRE</h1>
        <p className="text-muted-foreground">Nenhuma importação encontrada ainda. Use "Importar Planilha" para carregar o primeiro mês.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gerência — DRE</h1>
          <p className="text-muted-foreground">Acompanhamento mensal de resultado e metas AVR</p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="metas">
        <TabsList>
          <TabsTrigger value="metas">Metas AVR</TabsTrigger>
          <TabsTrigger value="estrutura">Estrutura do DRE</TabsTrigger>
          <TabsTrigger value="comparativo">Comparativo entre Meses</TabsTrigger>
          <TabsTrigger value="ranking">Ranking de Variações</TabsTrigger>
        </TabsList>

        <TabsContent value="metas" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Mês:</span>
            <Select value={mesEfetivo} onValueChange={setMes}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{MESES_LABEL[m] ?? m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Contas acompanhadas por meta AVR (% sobre receita líquida)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                    <TableHead className="text-right">AVR % Realizado</TableHead>
                    <TableHead className="text-right">Meta AVR</TableHead>
                    <TableHead className="text-right">Diferença (p.p.)</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metasLinhas.map(({ conta, lancamento, dentroDaMeta, gapPontos }) => (
                    <TableRow key={conta.conta_codigo}>
                      <TableCell>{conta.conta_codigo} | {conta.conta_nome}</TableCell>
                      <TableCell className="text-right">{formatNumero(lancamento.realizado)}</TableCell>
                      <TableCell className="text-right">{formatPercentual(lancamento.avr_percentual)}</TableCell>
                      <TableCell className="text-right">{formatPercentual(conta.meta_avr)}</TableCell>
                      <TableCell className={`text-right ${gapPontos > 0 ? "text-red-600" : "text-green-600"}`}>
                        {gapPontos > 0 ? "+" : ""}{gapPontos.toFixed(2)} p.p.
                      </TableCell>
                      <TableCell>
                        <Badge variant={dentroDaMeta ? "success" : "destructive"}>
                          {dentroDaMeta ? "Dentro da meta" : "Acima da meta"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {metasLinhas.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem dados para este mês.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estrutura" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Mês:</span>
            <Select value={mesEfetivo} onValueChange={setMes}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{MESES_LABEL[m] ?? m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composição dos totais (clique na seta para abrir)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raizesEstrutura.map((conta) => (
                    <ContaArvoreNo
                      key={conta.conta_codigo}
                      conta={conta}
                      sinal="+"
                      contasPorCodigo={contasPorCodigo}
                      lancamentosDoMes={lancamentosDoMesEstrutura}
                      nivel={0}
                      caminho={conta.conta_codigo}
                      expandidos={estruturaExpandidos}
                      onToggle={toggleEstrutura}
                    />
                  ))}
                  {raizesEstrutura.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sem dados para este mês.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparativo" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar conta..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={contaComparativoId} onValueChange={setContaComparativoId}>
              <SelectTrigger className="w-96"><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
              <SelectContent>
                {contasFiltradas.map((c) => (
                  <SelectItem key={c.conta_codigo} value={c.conta_codigo}>{c.conta_codigo} | {c.conta_nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {contaComparativo && (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">{contaComparativo.conta_codigo} | {contaComparativo.conta_nome}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={serieComparativo}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => formatNumero(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="Realizado" stroke="#1a4451" strokeWidth={2} />
                      <Line type="monotone" dataKey="Remunerado" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Realizado</TableHead>
                        <TableHead className="text-right">Remunerado</TableHead>
                        <TableHead className="text-right">Variação vs mês anterior</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serieComparativo.map((linha, i) => {
                        const anterior = i > 0 ? serieComparativo[i - 1].Realizado : null;
                        const variacao = anterior !== null && anterior !== 0 ? ((linha.Realizado - anterior) / Math.abs(anterior)) * 100 : null;
                        return (
                          <TableRow key={linha.mes}>
                            <TableCell>{linha.mes}</TableCell>
                            <TableCell className="text-right">{formatNumero(linha.Realizado)}</TableCell>
                            <TableCell className="text-right">{formatNumero(linha.Remunerado)}</TableCell>
                            <TableCell className="text-right">{variacao === null ? "-" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%`}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Comparar:</span>
            <Select value={mesA} onValueChange={setMesA}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{MESES_LABEL[m] ?? m}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">com:</span>
            <Select value={mesB} onValueChange={setMesB}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{MESES_LABEL[m] ?? m}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-red-600" /> Maiores variações ({MESES_LABEL[mesA]} → {MESES_LABEL[mesB]})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">{MESES_LABEL[mesA]}</TableHead>
                    <TableHead className="text-right">{MESES_LABEL[mesB]}</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maioresVariacoes.map(({ conta, realizadoA, realizadoB, delta }) => (
                    <TableRow key={conta.conta_codigo}>
                      <TableCell>{conta.conta_codigo} | {conta.conta_nome}</TableCell>
                      <TableCell className="text-right">{formatNumero(realizadoA)}</TableCell>
                      <TableCell className="text-right">{formatNumero(realizadoB)}</TableCell>
                      <TableCell className={`text-right flex items-center justify-end gap-1 ${delta < 0 ? "text-red-600" : "text-green-600"}`}>
                        {delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                        {formatNumero(Math.abs(delta))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {maioresVariacoes.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados suficientes para esses dois meses.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
