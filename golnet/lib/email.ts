import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "PalpitaAí <onboarding@resend.dev>";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function sendPasswordResetEmail(email: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Redefinir senha — PalpitaAí",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fff;border-radius:16px">
        <h1 style="font-size:28px;font-weight:800;margin:0 0 8px">
          <span style="color:#22c55e">Palpita</span>Aí
        </h1>
        <p style="color:#a1a1aa;margin:0 0 24px">Redefinição de senha</p>

        <p style="color:#e4e4e7;margin:0 0 24px">
          Recebemos uma solicitação para redefinir a senha da sua conta.<br>
          Clique no botão abaixo para criar uma nova senha.
        </p>

        <a href="${link}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#fff;font-weight:700;border-radius:10px;text-decoration:none;font-size:16px">
          Redefinir senha
        </a>

        <p style="color:#71717a;font-size:13px;margin:24px 0 0">
          Este link expira em <strong>1 hora</strong>.<br>
          Se você não solicitou a redefinição, pode ignorar este email.
        </p>
      </div>
    `,
  });
}
