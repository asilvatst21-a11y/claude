import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — PalpitaAí",
  description: "Política de Privacidade do PalpitaAí",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 text-zinc-300">
      <h1 className="text-3xl font-bold text-white mb-2">Política de Privacidade</h1>
      <p className="text-zinc-500 text-sm mb-8">Última atualização: maio de 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">1. Informações que coletamos</h2>
        <p className="mb-3">Ao usar o PalpitaAí, coletamos as seguintes informações:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Nome e endereço de e-mail (ao criar uma conta)</li>
          <li>Foto de perfil (opcional, via login social)</li>
          <li>Palpites e resultados registrados no app</li>
          <li>Dados de uso do aplicativo (páginas visitadas, funcionalidades utilizadas)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">2. Como usamos suas informações</h2>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Para criar e gerenciar sua conta</li>
          <li>Para exibir rankings e resultados de palpites</li>
          <li>Para enviar notificações relacionadas ao app (se habilitadas)</li>
          <li>Para enviar e-mails transacionais (redefinição de senha)</li>
          <li>Para melhorar nossos serviços</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">3. Compartilhamento de dados</h2>
        <p className="text-zinc-400">
          Não vendemos nem compartilhamos suas informações pessoais com terceiros, exceto quando necessário
          para o funcionamento do serviço (hospedagem, autenticação) ou quando exigido por lei.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">4. Segurança</h2>
        <p className="text-zinc-400">
          Utilizamos medidas de segurança adequadas para proteger seus dados, incluindo criptografia
          de senhas e comunicações via HTTPS.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">5. Seus direitos</h2>
        <p className="text-zinc-400 mb-2">Você pode a qualquer momento:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Acessar e atualizar suas informações na página de perfil</li>
          <li>Solicitar a exclusão da sua conta entrando em contato conosco</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">6. Contato</h2>
        <p className="text-zinc-400">
          Dúvidas sobre esta política? Entre em contato pelo e-mail:{" "}
          <a href="mailto:palpitai.suporte@gmail.com" className="text-green-400 hover:underline">
            palpitai.suporte@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
