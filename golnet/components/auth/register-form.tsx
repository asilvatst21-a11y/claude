"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAZIL_STATES, getCitiesByState } from "@/lib/cities";

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(50),
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "Apenas letras, números e _"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  state: z.string().min(1, "Selecione seu estado"),
  city: z.string().min(1, "Selecione sua cidade"),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState("");

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const cities = getCitiesByState(selectedState);

  const handleStateChange = (uf: string) => {
    setSelectedState(uf);
    setValue("state", uf, { shouldValidate: true });
    setValue("city", "", { shouldValidate: false });
  };

  const onSubmit = async (data: FormData) => {
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Erro ao criar conta.");
      return;
    }

    router.push("/login?registered=1");
  };

  const selectClass = "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white">
          <span className="text-green-400">Palpita</span>Aí
        </h1>
        <p className="text-zinc-400 mt-2">Crie sua conta e jogue</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input id="name" label="Nome completo" placeholder="João Silva" {...register("name")} error={errors.name?.message} />
          <Input id="username" label="Nome de usuário" placeholder="joaosilva10" {...register("username")} error={errors.username?.message} />
          <Input id="email" type="email" label="Email" placeholder="seu@email.com" {...register("email")} error={errors.email?.message} />
          <Input id="password" type="password" label="Senha" placeholder="••••••••" {...register("password")} error={errors.password?.message} />

          {/* Estado */}
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-1">Estado</label>
            <select
              className={selectClass}
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
            >
              <option value="">Selecione seu estado</option>
              {BRAZIL_STATES.map((s) => (
                <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>
              ))}
            </select>
            {errors.state && <p className="text-xs text-red-400 mt-1">{errors.state.message}</p>}
            <input type="hidden" {...register("state")} />
          </div>

          {/* Cidade */}
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-1">Cidade</label>
            <select
              className={selectClass}
              disabled={!selectedState}
              {...register("city")}
            >
              <option value="">{selectedState ? "Selecione sua cidade" : "Selecione o estado primeiro"}</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.city && <p className="text-xs text-red-400 mt-1">{errors.city.message}</p>}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={isSubmitting} size="lg" className="mt-2">
            Criar conta
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-400 mt-6">
          Já tem conta?{" "}
          <Link href="/login" className="text-green-400 hover:underline">
            Faça login
          </Link>
        </p>
      </div>
    </div>
  );
}
