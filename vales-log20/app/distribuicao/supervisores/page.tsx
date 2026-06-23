"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Phone, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import type { SupervisorTML } from "@/lib/types";

const SALA_LABEL: Record<string, string> = { INT: "Interior", PET: "Petrópolis" };

export default function SupervisoresTMLPage() {
  const { toast } = useToast();
  const [supervisores, setSupervisores] = useState<SupervisorTML[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<SupervisorTML | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<SupervisorTML | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [nome, setNome] = useState("");
  const [sala, setSala] = useState<"INT" | "PET" | "">("");
  const [telefone, setTelefone] = useState("");

  const fetchSupervisores = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/distribuicao/supervisores");
      if (!res.ok) throw new Error("Erro ao carregar supervisores");
      const data = await res.json();
      setSupervisores(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao carregar supervisores",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSupervisores();
  }, [fetchSupervisores]);

  function openCreate() {
    setEditing(null);
    setIsCreating(true);
    setNome("");
    setSala("");
    setTelefone("");
  }

  function openEdit(supervisor: SupervisorTML) {
    setEditing(supervisor);
    setIsCreating(true);
    setNome(supervisor.nome);
    setSala(supervisor.sala);
    setTelefone(supervisor.telefone);
  }

  async function handleSave() {
    if (!nome || !sala || !telefone) return;
    setIsSaving(true);
    try {
      const endpoint = editing
        ? `/api/distribuicao/supervisores/${editing.id}`
        : "/api/distribuicao/supervisores";
      const res = await fetch(endpoint, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, sala, telefone }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");

      toast({ title: editing ? "Supervisor atualizado" : "Supervisor cadastrado" });
      setIsCreating(false);
      setEditing(null);
      await fetchSupervisores();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/distribuicao/supervisores/${deleting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao excluir");

      toast({ title: "Supervisor removido" });
      setDeleting(null);
      await fetchSupervisores();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/distribuicao">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Supervisores — TML</h1>
          <p className="text-muted-foreground">
            Cadastre o supervisor responsável por sala para receber os alertas de TML
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSupervisores} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo supervisor
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Supervisores</CardTitle>
          <CardDescription>
            {supervisores.length} supervisor(es) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : supervisores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum supervisor cadastrado.</p>
              <p className="text-sm mt-1">
                Cadastre um supervisor por sala para receber os alertas de TML.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supervisores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell>{SALA_LABEL[s.sala] ?? s.sala}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-sm">{s.telefone}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleting(s)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar supervisor" : "Novo supervisor"}</DialogTitle>
            <DialogDescription>
              Defina o nome, a sala e o número de WhatsApp do supervisor responsável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sala">Sala</Label>
              <Select value={sala} onValueChange={(v) => setSala(v as "INT" | "PET")}>
                <SelectTrigger id="sala">
                  <SelectValue placeholder="Selecione a sala" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INT">Interior</SelectItem>
                  <SelectItem value="PET">Petrópolis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">WhatsApp</Label>
              <Input
                id="telefone"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="Ex: 21999999999 ou 5521999999999"
              />
              <p className="text-xs text-muted-foreground">
                Digite apenas números. O código do país (55) será adicionado
                automaticamente se não informado.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreating(false);
                setEditing(null);
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !nome || !sala || !telefone}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir supervisor</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleting?.nome}</strong>? Essa ação
              não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
