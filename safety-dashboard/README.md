# Safety Dashboard

Dashboard de análise de segurança de colaboradores para empresas de logística.

## Stack

- **Frontend:** React 18 + Vite + TailwindCSS
- **Backend:** Node.js + Express
- **Banco de dados:** SQLite via `better-sqlite3`
- **Estrutura:** Monorepo (`/client` + `/server`)

## Início rápido

```bash
# Instalar dependências
npm run install:all

# Popular banco com dados de demonstração
npm run seed

# Iniciar backend (porta 3001)
npm run dev:server

# Iniciar frontend (porta 5173)
npm run dev:client
```

## Score de Segurança

O score (0–100) é calculado automaticamente com os seguintes pesos:

| Componente | Peso | Critério de Criticidade |
|---|---|---|
| DTO | 30% | Vencido há mais de 30 dias = score 0 |
| Conduta | 40% | Avaliações negativas reduzem, positivas somam |
| Telemetria | 30% | Apenas motoristas; >10 excessos/mês = crítico |

**Níveis de risco:** Baixo (≥75) · Médio (≥50) · Alto (≥25) · Crítico (<25)

Score < 50 → encaminhamento de `encerramento_contrato` criado automaticamente.

---

## API REST

Base URL: `http://localhost:3001/api`

### Colaboradores

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/colaboradores` | Lista colaboradores. Query: `setor`, `lider_responsavel`, `status`, `cargo` |
| GET | `/colaboradores/:id` | Perfil completo com score calculado |
| POST | `/colaboradores` | Cria colaborador |
| PUT | `/colaboradores/:id` | Atualiza colaborador |
| DELETE | `/colaboradores/:id` | Inativa colaborador (soft delete) |

**Campos POST/PUT:** `nome`, `cargo`, `setor`, `lider_responsavel`, `data_admissao`, `status` (ativo|inativo)

### DTOs

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/dtos` | Lista DTOs. Query: `colaborador_id`, `status`, `lider_id` |
| GET | `/dtos/:id` | Detalhes do DTO |
| POST | `/dtos` | Cria DTO |
| PUT | `/dtos/:id` | Atualiza DTO |

**Campos POST/PUT:** `colaborador_id`, `data_realizacao`, `data_validade`, `status` (em_dia|vencido|ausente), `lider_id`, `observacoes`

### Avaliações de Conduta

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/avaliacoes` | Lista avaliações. Query: `colaborador_id`, `tipo`, `gravidade_min`, `data_inicio`, `data_fim` |
| GET | `/avaliacoes/:id` | Detalhes da avaliação |
| POST | `/avaliacoes` | Registra avaliação |
| PUT | `/avaliacoes/:id` | Atualiza avaliação |
| DELETE | `/avaliacoes/:id` | Remove avaliação |

**Campos POST/PUT:** `colaborador_id`, `data`, `tipo` (ato_inseguro|condicao_insegura|abordagem_positiva), `descricao`, `gravidade` (1–5), `registrado_por`

### Telemetria de Condução

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/telemetria` | Lista registros. Query: `motorista_id`, `periodo_ref` (YYYY-MM) |
| GET | `/telemetria/:id` | Detalhes do registro |
| POST | `/telemetria` | Cria registro (calcula `score_calculado` automaticamente) |
| PUT | `/telemetria/:id` | Atualiza registro |

**Campos POST/PUT:** `motorista_id`, `periodo_ref` (YYYY-MM), `qtd_excessos_velocidade`, `qtd_frenagens_bruscas`, `qtd_curvas_bruscas`

### Encaminhamentos

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/encaminhamentos` | Lista encaminhamentos. Query: `colaborador_id`, `tipo`, `status`, `lider_id` |
| GET | `/encaminhamentos/:id` | Detalhes |
| POST | `/encaminhamentos` | Cria encaminhamento |
| PUT | `/encaminhamentos/:id` | Atualiza status/prazo |

**Campos POST/PUT:** `colaborador_id`, `tipo` (refazer_dto|feedback|encerramento_contrato), `lider_id`, `prazo`, `status` (pendente|concluido)

### Dashboard

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/dashboard/summary` | KPIs globais: total colaboradores, DTOs críticos, score médio, encaminhamentos pendentes |
| GET | `/dashboard/scores` | Ranking de colaboradores com score e nível de risco. Query: `setor`, `lider_responsavel`, `risco` |
| GET | `/dashboard/alerts` | Alertas ativos: DTOs críticos, telemetria crítica, scores baixos |
| GET | `/dashboard/score-history` | Histórico mensal de score (últimos 6 meses) |

**Exemplo de resposta `/dashboard/summary`:**
```json
{
  "totalColaboradores": 25,
  "totalAtivos": 25,
  "dtosEmDia": 12,
  "dtosCriticos": 8,
  "encaminhamentosPendentes": 5,
  "scoreMedia": 71
}
```

**Exemplo de resposta `/dashboard/scores`:**
```json
[
  { "id": 21, "nome": "Carlos Risco", "setor": "Logística", "cargo": "Motorista", "score": 8, "riskLevel": "critico" },
  ...
]
```

### Relatórios

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/reports/csv` | Exporta CSV. Query: `data_inicio`, `data_fim`, `setor`, `lider_responsavel`, `risco` |

O download de PDF é feito via `window.print()` no frontend (impressão do relatório em tela).

---

## Telas

1. **Dashboard geral** (`/`) — KPIs, ranking de score, alertas ativos, gráfico de tendência
2. **Ficha do colaborador** (`/colaboradores/:id`) — histórico de DTOs, condutas, telemetria e encaminhamentos
3. **Gestão de encaminhamentos** (`/encaminhamentos`) — fila de ações por líder com atualização de status
4. **Relatórios** (`/relatorios`) — exportação CSV e impressão PDF com filtros por período, setor, líder e risco
