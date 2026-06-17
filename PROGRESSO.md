# Progresso do Projeto

Branch de desenvolvimento: `claude/start-new-project-znnaq`
Deploy: `painelanalitico.vercel.app` (promovido para `main` via GitHub Actions)

---

## ✅ Concluído

### Controle de acesso por seção (matriculas-whatsapp)
- Coluna `permissoes text[]` em `usuarios` (null = sem restrição, [] = bloqueado, ['gsdpq'] = só essa seção).
- Sidebar (`Layout.tsx`) filtra itens por permissão; admin vê tudo.
- Tela **Admin** com botão de cadeado para configurar permissões por usuário (agrupadas por Segurança/Gente/Financeiro/Admin).
- Conflito de merge no `Layout.tsx` resolvido (sidebar recolhível + seção Financeiro/Vales + filtro de permissão juntos).

### Fluxo Punitivo
- Botão **lixeira** corrigido para GSDPQ; exclusão remove também o registro da tabela de origem (`source_id`).
- Correção de nome do colaborador no `ModalDefinirAcao` via lista de `colaboradores` (agrupada por função).
- **Sugestão automática de nome** por similaridade (Jaccard por tokens, threshold 0.5) — aplica a todas as origens (Vales, Grupo, GSDPQ, etc.).

### Solicitar Fluxo a partir de Vales
- Botão **"Fluxo"** nos vales com status Faturado/Faturar.
- Modal confirma colaborador (ajudante) + data → insere em `fluxo_punitivo` (origem `Vales`, motivo `GERAÇÃO DE VALE FISICO`, status `Solicitado`).
- Envia mensagem ao grupo WhatsApp da filial (mesmo padrão do GSDPQ).

### WhatsApp — Fluxo Punitivo via grupo
- Webhook `api/zapi-webhook.ts` recebe `Fluxo: NOME / Motivo - X / Data: DD/MM`, confirma SIM/NÃO no grupo e cria o fluxo.

### WhatsApp — Reposições via grupo (IA) ⬅️ NOVO
- Motorista manda mensagem livre (texto ou áudio) no grupo de reposições.
- **Claude Haiku 4.5** + structured outputs extrai: `codigo_pdv`, `mapa`, `produto`, `quantidade`, `tipo_reposicao` (falta/inversão/avaria).
- Bot responde com resumo; motorista confirma SIM/NÃO; ao confirmar salva em `reposicoes` (pendente).
- Tela **Vales → Reposições** mostra colunas **Tipo** e **PDV**.
- Webhook roteia o grupo por `filiais.grupo_fluxo_whatsapp` vs `grupo_reposicoes_whatsapp`.

### Infra / Deploy
- Workflow `promote-to-main.yml`: faz merge na `main` (dispara o deploy único do Vercel). Removido o Deploy Hook duplicado.
- Bug do espaço inicial na pergunta do giro 360 (Gsdpq.tsx) corrigido.

### Banco de dados (executado pelo usuário)
- ✅ Tabela `reposicao_confirmacoes`
- ✅ Colunas `reposicoes.codigo_pdv` e `reposicoes.tipo_reposicao`
- ✅ Coluna `filiais.grupo_reposicoes_whatsapp`
- ⚠️ Falta executar (controle de acesso): `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes text[];`

---

## ⏳ Pendente

### 1. Chave da IA no Vercel (BLOQUEADOR das reposições por IA)
- Gerar `ANTHROPIC_API_KEY` em console.anthropic.com (precisa de créditos em Billing).
- Adicionar em Vercel → Settings → Environment Variables (Production).
- **Redeploy** após salvar.

### 2. Transcrição de áudio — PLANO B
- ❌ A Z-API do usuário **não tem** a opção de transcrição automática de áudio no painel.
- **Decisão pendente:** implementar transcrição via **Groq Whisper** (barato, rápido — precisa de 1 chave `GROQ_API_KEY`) OU seguir só com texto por enquanto.
- Enquanto isso: áudio sem texto → bot pede para reenviar por texto (já tratado no webhook).

### 3. Configurar `grupo_reposicoes_whatsapp` da filial
```sql
UPDATE filiais SET grupo_reposicoes_whatsapp = 'ID_DO_GRUPO@g.us' WHERE nome = 'SUA_FILIAL';
```

### 4. Configurar permissões dos usuários (após rodar o ALTER de `permissoes`)
- `finpet`: somente seção **Financeiro / Vales**.
- `tstpet`: tudo **exceto** Vales.
- Configurar pela tela Admin (botão de cadeado).

---

## Notas
- Webhook configurado em "Ao receber": `https://painelanalitico.vercel.app/api/zapi-webhook`
- Cada solicitação de reposição custa fração de centavo (Haiku 4.5).
