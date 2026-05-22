import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "Criar conta — PalpitaAí" };

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <RegisterForm />
    </div>
  );
}
