import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Loader2, RefreshCw, Phone, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { valesSupabase } from "@/lib/valesSupabase";
import type { AjudanteComVales } from "@/lib/valesTypes";

export default function AjudantesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ajudantes, setAjudantes] = useState<AjudanteComVales[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAjudante, setEditingAjudante] = useState<AjudanteComVales | null>(null);
  const [editTelefone, setEditTelefone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchAjudantes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await valesSupabase
        .from("ajudantes")
        .select(`
          id, codigo, nome, telefone, created_at, updated_at,
          vale_ajudantes ( vale_id, vales ( id, status_vale ) )
        `)
        .order("nome");

      if (error) throw new Error(error.message);

      const ajudantesComVales = (data ?? []).map((aj) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const valeLinks = aj.vale_ajudantes as any[];
        return {
          id: aj.id,
          codigo: aj.codigo,
          nome: aj.nome,
          telefone: aj.telefone,
          created_at: aj.created_at,
          updated_at: aj.updated_at,
          vales_abonados: valeLinks.filter((va) => va.vales?.status_vale === "Abonado").length,
          vales_faturados: valeLinks.filter((va) => va.vales?.status_vale === "Faturado").length,
          vales_pendentes: valeLinks.filter((va) => {
            const s = va.vales?.status_vale;
            return s === "Sem Ação" || s === "Faturar";
          }).length,
        };
      });

      setAjudantes(ajudantesComVales);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao carregar ajudantes",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAjudantes(); }, [fetchAjudantes]);

  const handleSaveTelefone = async () => {
    if (!editingAjudante) return;
    setIsSaving(true);
    try {
      const { error } = await valesSupabase
        .from("ajudantes")
        .update({ telefone: editTelefone || null, updated_at: new Date().toISOString() })
        .eq("id", editingAjudante.id);

      if (error) throw new Error(error.message);

      toast({ title: "Telefone atualizado", description: `Telefone de ${editingAjudante.nome} atualizado com sucesso.` });
      setEditingAjudante(null);
      await fetchAjudantes();
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err instanceof Error ? err.message : "Erro desconhecido" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajudantes</h1>
          <p className="text-muted-foreground">Gerencie os ajudantes e seus contatos WhatsApp</p>
        </div>
        <Button variant="outline" onClick={fetchAjudantes} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Ajudantes</CardTitle>
          <CardDescription>{ajudantes.length} ajudante(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2">Carregando...</span>
            </div>
          ) : ajudantes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum ajudante cadastrado.</p>
              <p className="text-sm mt-1">Importe uma planilha para cadastrar ajudantes automaticamente.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Vales</TableHead>
                  <TableHead>Pendentes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ajudantes.map((ajudante) => (
                  <TableRow key={ajudante.id}>
                    <TableCell className="font-mono text-sm">{ajudante.codigo}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/vales?ajudante=${ajudante.id}`)}
                        className="font-medium hover:underline text-primary"
                      >
                        {ajudante.nome}
                      </button>
                    </TableCell>
                    <TableCell>
                      {ajudante.telefone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-sm">{ajudante.telefone}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">Não cadastrado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ajudante.vales_abonados > 0 && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">{ajudante.vales_abonados} Ab</span>
                        )}
                        {ajudante.vales_faturados > 0 && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{ajudante.vales_faturados} Fat</span>
                        )}
                        {ajudante.vales_pendentes > 0 && (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">{ajudante.vales_pendentes} Pend</span>
                        )}
                        {ajudante.vales_abonados === 0 && ajudante.vales_faturados === 0 && ajudante.vales_pendentes === 0 && (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {ajudante.vales_pendentes > 0 ? (
                        <Badge variant="warning">{ajudante.vales_pendentes} pendente(s)</Badge>
                      ) : (
                        <Badge variant="success">Sem pendências</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => { setEditingAjudante(ajudante); setEditTelefone(ajudante.telefone ?? ""); }}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar Telefone
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingAjudante} onOpenChange={(open) => { if (!open) setEditingAjudante(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Telefone WhatsApp</DialogTitle>
            <DialogDescription>
              Atualize o número de WhatsApp de <strong>{editingAjudante?.nome}</strong> (Cód. {editingAjudante?.codigo})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Número WhatsApp</Label>
              <Input
                id="telefone"
                type="tel"
                placeholder="Ex: 21999999999"
                value={editTelefone}
                onChange={(e) => setEditTelefone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Digite apenas números. O código do país (55) será adicionado automaticamente se não informado.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAjudante(null)} disabled={isSaving}>
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={handleSaveTelefone} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
