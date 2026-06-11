"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError(null);
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email ou senha incorretos.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white">
          <span className="text-green-400">Palpita</span>Aí
        </h1>
        <p className="text-zinc-400 mt-2">Faça login para jogar</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="seu@email.com"
            {...register("email")}
            error={errors.email?.message}
          />
          <Input
            id="password"
            type="password"
            label="Senha"
            placeholder="••••••••"
            {...register("password")}
            error={errors.password?.message}
          />

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={isSubmitting} size="lg" className="mt-2">
            Entrar
          </Button>
        </form>

        <div className="flex justify-between mt-6 text-sm text-zinc-400">
          <Link href="/forgot-password" className="hover:text-green-400 transition-colors">
            Esqueceu a senha?
          </Link>
          <Link href="/register" className="hover:text-green-400 transition-colors">
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}
