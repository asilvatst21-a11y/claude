# Vales LOG20 - Sistema de Gerenciamento de Vales

Sistema para gerenciar vales de uma empresa de logística brasileira (LOG20). Quando equipes de entrega retornam de rotas com produtos ou contêineres faltando, um "vale" é gerado.

## Funcionalidades

- **Importar planilha Excel** com dados de vales
- **Identificar ajudantes** responsáveis pelos vales
- **Enviar mensagens WhatsApp** (Z-API) notificando ajudantes para comparecer ao financeiro
- **Acompanhar status** dos vales (Abonado, Faturado, Faturar, Sem Ação)
- **Notificação final** quando o status é resolvido

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta no [Z-API](https://z-api.io) (para envio de WhatsApp)

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo `.env.local` e preencha as variáveis:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

ZAPI_INSTANCE_ID=seu-instance-id
ZAPI_TOKEN=seu-token
ZAPI_CLIENT_TOKEN=seu-client-token
```

### 3. Configurar banco de dados Supabase

Execute o arquivo `supabase/schema.sql` no **SQL Editor** do Supabase para criar as tabelas necessárias.

### 4. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no navegador.

## Estrutura do Projeto

```
app/
  page.tsx              # Dashboard principal
  importar/page.tsx     # Importar planilha Excel
  vales/page.tsx        # Lista e gerenciamento de vales
  ajudantes/page.tsx    # Gerenciamento de ajudantes
  api/
    importar/route.ts   # API: importar planilha
    vales/route.ts      # API: listar vales
    vales/[id]/route.ts # API: vale individual
    notificar/route.ts  # API: enviar notificação WhatsApp
    ajudantes/route.ts  # API: listar/criar ajudantes
    ajudantes/[id]/route.ts # API: atualizar ajudante

components/
  nav.tsx               # Navegação lateral
  ui/                   # Componentes de UI

lib/
  types.ts              # Tipos TypeScript
  utils.ts              # Funções utilitárias
  excel-parser.ts       # Parser de planilha Excel
  zapi.ts               # Integração Z-API WhatsApp
  supabase/
    client.ts           # Cliente Supabase (browser)
    server.ts           # Cliente Supabase (servidor)

supabase/
  schema.sql            # Schema do banco de dados
```

## Estrutura da Planilha Excel

A planilha deve seguir o formato:

| Coluna | Conteúdo |
|--------|----------|
| 10 | Código Ajudante 1 |
| 11 | Nome Ajudante 1 |
| 12 | Código Ajudante 2 (opcional) |
| 13 | Nome Ajudante 2 (opcional) |
| 14 | Mapa |
| 15 | Data (data serial Excel) |
| 18 | Número do Vale |
| 19 | Data Emissão Vale (data serial Excel) |
| 20 | Tipo do Item |
| 22 | Item (nome do produto) |
| 28 | Quantidade Diferença |
| 30 | Valor |
| 38 | Justificativa do Ajudante |
| 39 | Ação Transportadora |
| 67 | Status Vale |

## Status dos Vales

- **Sem Ação** (cinza) - Pendente, sem ação tomada
- **Faturar** (amarelo) - A ser faturado
- **Faturado** (vermelho) - Já faturado
- **Abonado** (verde) - Vale abonado/cancelado

## WhatsApp (Z-API)

Configure as credenciais Z-API no `.env.local`. As notificações são enviadas:

1. **Ao importar** novos vales: "Você possui vales pendentes no sistema LOG20..."
2. **Ao resolver** um vale (Abonado/Faturado): "Seu vale #X foi resolvido..."

O número de telefone deve ser cadastrado para cada ajudante na página de Ajudantes.
