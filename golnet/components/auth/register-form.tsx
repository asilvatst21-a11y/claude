"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(50),
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "Apenas letras, números e _"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

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
