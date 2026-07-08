# Relatório de Auditoria de Segurança — matriculas-whatsapp

**Data:** 08/07/26
**Escopo:** `matriculas-whatsapp/` (frontend React/Vite + função serverless `api/zapi-webhook.ts` + migrations Supabase)
**Natureza:** Auditoria somente-leitura. **Nenhuma correção foi aplicada** — este documento apenas reporta.

---

## Resumo executivo

| Severidade | Qtd | Itens |
|---|---|---|
| 🔴 Crítico | 4 | C1 service_role no bundle · C2 senhas em texto puro · C3 RLS `USING(true)` em tudo · C4 autenticação 100% client-side |
| 🟠 Alto | 3 | A1 credenciais Z-API no bundle · A2 webhook sem autenticação por padrão · A3 vulnerabilidades de dependências (xlsx/vite) |
| 🟡 Médio | 4 | M1 vazamento de PII/CPF+salário no totem público · M2 sem rate limiting · M3 filtro PostgREST com interpolação · M4 escrita pública direta no banco |
| 🔵 Baixo | 3 | B1 sessão em localStorage sem assinatura · B2 select traz `senha` ao cliente · B3 erros do banco expostos crus na UI |

> **Achado central (cadeia crítica):** C1 + C2 + C3 se combinam. Como a `anon key` (e pior, a `service_role`) chega ao navegador, **e** toda tabela tem policy `USING (true)`, **e** a tabela `usuarios` guarda senha em texto puro — qualquer pessoa com a URL do site consegue rodar `SELECT * FROM usuarios` e obter **todos os logins e senhas em texto puro**, além de ler/alterar/apagar qualquer tabela do banco. Trate como comprometimento total do banco até corrigir.

**Pontos positivos confirmados:** `.env` está no `.gitignore`; nenhum segredo foi encontrado no histórico do git; nenhum `dangerouslySetInnerHTML`/`eval`/`innerHTML` (sem sink clássico de XSS); nenhum log de senha/token/chave.

---

## 🔴 CRÍTICO

### C1 — Chave `service_role` do Supabase exposta no bundle do frontend
- **Arquivo:** `src/lib/valesSupabase.ts:7` (definição) · `.env.example:20` (`VITE_SUPABASE_SERVICE_KEY`)
- **Problema:** O prefixo `VITE_` faz o Vite **embutir a variável no JavaScript entregue ao navegador**. A `service_role` **ignora todas as políticas RLS** — é a chave de administrador do banco. Qualquer visitante pode abri-la no DevTools (ou no `.js` publicado) e ter controle total: ler, alterar e apagar qualquer tabela, contornando qualquer restrição.
- **Impacto:** Comprometimento total e irreversível do banco por qualquer pessoa na internet.
- **Correção sugerida:**
  1. **Rotacionar a `service_role` imediatamente** no painel do Supabase (a atual deve ser considerada vazada).
  2. Remover `valesSupabase` do frontend. Toda operação que precisa de `service_role` (imports/reposições em lote) deve ir para uma função serverless (`api/`) que use `process.env.SUPABASE_SERVICE_ROLE` **sem** prefixo `VITE_`.
  3. No front, usar apenas a `anon key` (via `src/lib/supabase.ts`), com RLS de verdade (ver C3).

### C2 — Senhas armazenadas e comparadas em texto puro
- **Arquivo:** `src/lib/auth.tsx:29-40` · `supabase-schema.sql` (coluna `usuarios.senha`)
- **Problema:** O login faz `.eq('senha', senha)` — a senha do usuário é comparada diretamente com o valor guardado, ou seja, **está em texto puro no banco**. Não há hash (bcrypt/argon2) nem salt.
- **Impacto:** Qualquer leitura da tabela `usuarios` (trivial hoje — ver C3) entrega todas as senhas reais. Usuários costumam reutilizar senhas, então o vazamento se espalha para outros sistemas.
- **Correção sugerida:** Migrar autenticação para um fluxo no servidor que armazene apenas `hash` (bcrypt/argon2). Idealmente, adotar **Supabase Auth** (`auth.users`) em vez de tabela própria, e forçar reset de todas as senhas atuais (considerá-las vazadas).

### C3 — RLS permissivo (`USING (true) WITH CHECK (true)`) em todas as tabelas
- **Arquivo:** `supabase-schema.sql:79` (`usuarios`) e **18 arquivos de migration** com o mesmo padrão `CREATE POLICY "Acesso total" ... FOR ALL USING (true)` (ex.: `variavel_pontuacao`, `armazem_colaboradores`, `conferencia_*`, `frota_*`, `alertas_fixacao_motorista`, etc.)
- **Problema:** RLS está *habilitado*, mas a policy libera tudo para todos (inclusive o papel `anon`). Não há nenhuma policy baseada em `auth.uid()`/`auth.role()` (confirmado: zero ocorrências). Na prática, o RLS não protege nada — a `anon key` no browser lê e escreve qualquer linha de qualquer tabela.
- **Impacto:** Leitura/escrita/exclusão de todo o banco por qualquer um: credenciais (`usuarios`), CPFs e valores de variável, dados de motoristas, telefones, etc.
- **Correção sugerida:** Definir o modelo de acesso real. Como o app é interno, a rota mais segura é **não expor tabelas sensíveis ao papel `anon`**: mover leitura/escrita para funções serverless autenticadas e restringir as policies (ex.: `usuarios` sem acesso `anon` nenhum; tabelas de PII só via service_role no backend). No mínimo, remover `SELECT` de `anon` da `usuarios` e das tabelas com CPF.

### C4 — Autenticação e autorização inteiramente no client-side
- **Arquivo:** `src/lib/auth.tsx` · `src/App.tsx:58-71` (`ProtectedRoutes`/`AdminRoute`)
- **Problema:** A "sessão" é apenas um objeto salvo em `localStorage`; `ProtectedRoutes`/`AdminRoute` só olham esse objeto em memória. Não há verificação no servidor. Um atacante define `localStorage['pdv-critico-user'] = {"admin":true,...}` e vira admin — e, mesmo sem isso, acessa os dados direto pela `anon key` sem passar pela UI.
- **Impacto:** Qualquer controle de acesso do app (admin, permissões por página) é decorativo.
- **Correção sugerida:** Autorização precisa ser imposta no backend/RLS (ver C3). O gate de UI pode continuar, mas nunca ser a única barreira.

---

## 🟠 ALTO

### A1 — Credenciais do Z-API expostas no bundle do frontend
- **Arquivo:** `src/lib/zapi.ts:1-3` · `src/lib/valesZapi.ts:3-5` · `.env.example:6-8` (`VITE_ZAPI_INSTANCE/TOKEN/CLIENT_TOKEN`)
- **Problema:** `instance`, `token` e `client-token` do Z-API vão para o navegador. Com eles, qualquer um envia mensagens de WhatsApp pela instância da empresa (spam/phishing em nome da LOG20), potencialmente lê contatos e status da instância.
- **Impacto:** Abuso da conta de WhatsApp corporativa; custo e dano reputacional.
- **Correção sugerida:** Rotacionar os tokens do Z-API. Nunca enviar mensagem direto do front — encaminhar por uma função serverless (`api/`) que guarde os tokens em env **sem** `VITE_`. O webhook já usa a versão server-side; replicar esse padrão para todo envio.

### A2 — Webhook sem autenticação por padrão
- **Arquivo:** `api/zapi-webhook.ts:1537` · `.env.example:29` (`ZAPI_WEBHOOK_SECRET=` vazio)
- **Problema:** A checagem `if (WEBHOOK_SECRET && req.query?.token !== WEBHOOK_SECRET)` só roda **se** o segredo estiver configurado. O `.env.example` deixa vazio, então em produção o endpoint provavelmente aceita **qualquer POST**. Um atacante forja payloads de webhook e dispara mensagens de WhatsApp, cria reposições, avança fluxos e escreve no banco (a função usa `service_role`).
- **Impacto:** Injeção de eventos falsos, envio de mensagens, escrita arbitrária nas tabelas tocadas pelo fluxo.
- **Correção sugerida:** Tornar o segredo **obrigatório** — recusar (401) quando `WEBHOOK_SECRET` não estiver setado. Preferir validar a assinatura HMAC do provedor, se o Z-API oferecer, em vez de token em query string (que vaza em logs/URLs).

### A3 — Dependências com vulnerabilidades conhecidas
- **Arquivo:** `package.json` (via `npm audit`)
- **Problema:** `npm audit` (prod) aponta 3 vulnerabilidades (2 altas):
  - **`xlsx` (SheetJS)** — Prototype Pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS (GHSA-5pgg-2g8v-p4x9). **Sem fix disponível** no registry npm. Relevante porque o app faz parse de planilhas **enviadas por usuários** (imports de pontuação, colaboradores, separação) — entrada controlada pelo atacante alimentando o parser.
  - **`vite` 8.0.x** — bypass de `server.fs.deny` e disclosure via `launch-editor` (afeta dev server em Windows; `npm audit fix` resolve).
  - `@babel/core` — leitura de arquivo via sourceMappingURL (baixo).
- **Impacto:** Poluição de protótipo/ReDoS a partir de planilha maliciosa; risco no ambiente de dev.
- **Correção sugerida:** Rodar `npm audit fix` (resolve vite/babel). Para `xlsx`, migrar para o build oficial do SheetJS (`https://cdn.sheetjs.com/`, que é mais novo que o do npm) ou trocar por `exceljs`; enquanto isso, validar/limitar tamanho e origem dos arquivos e tratar o parse como não-confiável.

---

## 🟡 MÉDIO

### M1 — Totem público vaza CPF completo + nome + valor de variável
- **Arquivo:** `src/lib/variavelArmazem.ts:282-312` (`buscarTotem`, retorna `cpf` completo) · `src/pages/VariavelTotem.tsx` · rota pública `/variavel-armazem` em `src/App.tsx:98`
- **Problema:** O totem é público e busca por **prefixo de 3 dígitos** do CPF (`.like('cpf', '${prefixo}%')`), retornando nome, **CPF completo** e valor pago. O espaço de prefixos é só 000–999: um atacante itera os 1000 prefixos e coleta o cadastro inteiro (nome + CPF + salário variável) — exposição de PII em massa, com implicações de LGPD.
- **Impacto:** Vazamento de dados pessoais e financeiros de todos os colaboradores.
- **Correção sugerida:** Nunca retornar o CPF completo ao cliente (mascarar, ex.: `***.456.***-**`). Exigir mais dígitos ou um segundo fator (data de nascimento/matrícula). Idealmente mover a consulta para uma função serverless com rate limiting e retornar só o valor da pessoa correspondente.

### M2 — Ausência de rate limiting no login e nas rotas públicas
- **Arquivo:** `src/lib/auth.tsx:28-41` (login) · `api/zapi-webhook.ts:1532` (webhook) · páginas públicas (`MatinalTML`, `ConferenciaDigital`, `VariavelTotem`, `SolicitarExtra`)
- **Problema:** Login é uma query direta ao Supabase, sem throttling — permite brute force de senha (agravado por C2/C3). Webhook e páginas públicas também não têm limite, permitindo enumeração (M1) e flood.
- **Impacto:** Força bruta de credenciais, enumeração de PII, abuso/DoS de baixo custo.
- **Correção sugerida:** Colocar login e endpoints públicos atrás de funções serverless com rate limiting (ex.: por IP/janela) e lockout progressivo. Considerar CAPTCHA em fluxos públicos abusáveis.

### M3 — Interpolação de entrada externa em filtro PostgREST (`.or`)
- **Arquivo:** `api/zapi-webhook.ts:1579`
- **Problema:** `.or(\`grupo_fluxo_whatsapp.eq.${grupoId},...\`)` monta a string de filtro com `grupoId` vindo de `body.phone` (controlado por quem chama o webhook — que hoje é não autenticado, ver A2). Caracteres como vírgula/parêntese/`.` podem alterar a expressão de filtro (PostgREST filter injection), mudando quais linhas são retornadas.
- **Impacto:** Manipulação da lógica de roteamento do webhook; possível leitura de linhas não pretendidas. Não é SQL injection clássico (PostgREST parametriza o SQL final), mas é injeção na camada de filtro.
- **Correção sugerida:** Validar `grupoId` com allowlist de formato (ex.: regex de ID de grupo do WhatsApp) antes de usar. Preferir consultas com `.eq()`/`.in()` em vez de montar string `.or()`. Autenticar o webhook (A2) reduz a superfície.

### M4 — Escrita pública direta no banco a partir de páginas sem login
- **Arquivo:** `src/pages/ConferenciaDigital.tsx`, `src/pages/VariavelTotem.tsx`, `src/pages/MatinalTML.tsx`, `src/pages/SolicitarExtra.tsx` (todas usam `supabase` anon) · rotas em `src/App.tsx:95-98`
- **Problema:** Páginas públicas escrevem direto nas tabelas com a `anon key` e RLS aberto (C3). A "validação de input" existe só no componente e é trivial de contornar chamando o Supabase direto. Sem verificação de integridade no servidor.
- **Impacto:** Inserção/alteração de dados forjados (conferências, pontuações, solicitações) por qualquer um.
- **Correção sugerida:** Rotear escritas públicas por funções serverless que validem o payload e apliquem regras de negócio, com RLS restrito (ver C3). Validar tamanho/tipo/limites de cada campo no servidor.

---

## 🔵 BAIXO

### B1 — Sessão em localStorage sem assinatura
- **Arquivo:** `src/lib/auth.tsx:15,21-23,37` (`STORAGE_KEY = 'pdv-critico-user'`)
- **Problema:** O usuário (incl. `admin`/`permissoes`) é guardado como JSON puro, editável pelo próprio usuário. Subitem de C4; listado à parte por ser um vetor concreto de escalonamento de privilégio no client.
- **Correção sugerida:** Não confiar em nada do localStorage para autorização; impor no backend (C3/C4).

### B2 — Query de login retorna a coluna `senha` ao cliente
- **Arquivo:** `src/lib/auth.tsx:31` (`.select('... senha ...')`)
- **Problema:** O `select` inclui `senha`, que fica no objeto do usuário e é salvo em localStorage — expõe a senha (texto puro, C2) no dispositivo desnecessariamente.
- **Correção sugerida:** Remover `senha` do `select`. Com autenticação no servidor (C2/C4), o hash nunca deveria trafegar.

### B3 — Mensagens de erro do banco exibidas cruas na interface
- **Arquivo:** `src/lib/auth.tsx:38` (`erro: error.message`) e vários handlers que fazem `setErro(err.message)` (ex.: `ConferenciaDigital.tsx`, libs que dão `throw new Error(error.message)`)
- **Problema:** Erros do Postgres/Supabase repassados direto à UI podem revelar nomes de tabelas/colunas/constraints, ajudando o reconhecimento de um atacante.
- **Correção sugerida:** Logar o erro técnico no servidor e mostrar mensagem genérica ao usuário.

---

## Recomendações priorizadas

1. **Rotacionar já** a `service_role` do Supabase e os tokens do Z-API (considerá-los vazados — C1/A1).
2. **Tirar `VITE_SUPABASE_SERVICE_KEY` e os `VITE_ZAPI_*` do frontend**; mover toda operação privilegiada para funções serverless (C1/A1).
3. **Redesenhar autenticação**: hash de senha + auth no servidor (idealmente Supabase Auth), forçar reset de senhas atuais (C2/C4).
4. **Refazer as policies RLS** para restringir o papel `anon`, começando por `usuarios` e tabelas com CPF (C3).
5. **Tornar o segredo do webhook obrigatório** e validar `grupoId` (A2/M3).
6. `npm audit fix` + plano para o `xlsx` (A3).
7. **Mascarar CPF** e endurecer o totem/páginas públicas com rate limiting (M1/M2/M4).

> Enquanto C1–C3 não forem corrigidos, o banco deve ser considerado publicamente acessível para leitura e escrita.
