import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Login — GolNet" };

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}
