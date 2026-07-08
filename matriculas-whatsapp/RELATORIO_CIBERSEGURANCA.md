# Relatório de Cibersegurança e Privacidade de Dados
### Painel Analítico LOG20 — integração com relatórios do sistema Ambev

**Data:** 08/07/2026
**Público:** Time de Compliance / Segurança da Informação (Ambev) e T.I. LOG20
**Natureza:** Avaliação técnica de segurança e de fluxo de dados. Não é uma certificação formal nem parecer jurídico — é um levantamento técnico honesto do estado atual, para subsidiar a decisão de compliance.

---

## 1. Sumário executivo — respostas diretas

O compliance tem duas perguntas centrais. As respostas honestas:

### 1.1. Existe risco de exposição dos dados?
**Existia risco relevante; foi corrigido nesta rodada de trabalho.** Uma auditoria interna identificou falhas (banco acessível de forma ampla, senhas em texto puro, chave de administração exposta). **Todas as falhas críticas foram corrigidas** (detalhe na Seção 5). Restam itens de menor severidade, listados de forma transparente na Seção 6, com plano de tratamento.

### 1.2. Existe compartilhamento de dados com Inteligência Artificial?
Há **três** usos distintos de I.A. no projeto. A distinção é essencial:

| Uso de I.A. | Os relatórios Ambev passam por aqui? | Observação |
|---|---|---|
| **1. I.A. de desenvolvimento** (assistente de programação) | ❌ **Não** | Enxerga apenas o código-fonte, nunca dados de produção. |
| **2. Processamento dos relatórios Ambev** | ❌ **Não** | Relatórios são importados como planilha, processados no navegador e gravados no banco. **Nenhuma I.A. participa.** |
| **3. Bot de WhatsApp (reposições)** | ❌ **Não (não são os relatórios Ambev)** | ✅ **Porém** envia o **texto/áudio das mensagens dos motoristas** para Anthropic (Claude) e Groq (Whisper). É dado operacional, não os relatórios Ambev. Detalhe na Seção 4. |

**Conclusão para o compliance:** os **relatórios extraídos do sistema Ambev não são enviados a nenhum serviço de I.A.** O único ponto de contato com I.A. em produção é o **bot de WhatsApp**, que processa mensagens digitadas/faladas por motoristas — um fluxo separado, disclosado abaixo, controlável e desativável.

---

## 2. Arquitetura e onde os dados ficam

Fluxo do dado, da origem ao armazenamento:

```
Relatório do sistema Ambev (exportado manualmente por um humano)
        │  (arquivo .xlsx / .csv)
        ▼
Navegador do usuário  →  parsing feito localmente (biblioteca no front)
        │
        ▼
Supabase (banco PostgreSQL gerenciado)  ←  armazenamento definitivo
        │
        ▼
Painel Analítico (telas de análise, rankings, dashboards)
```

Pontos-chave:
- **A extração do relatório do sistema Ambev é sempre uma ação humana.** O sistema não se conecta ao ambiente Ambev; ele recebe um arquivo que uma pessoa exportou e subiu.
- **O parsing (leitura da planilha) acontece no navegador do próprio usuário.** O dado vira registros estruturados e é gravado no banco.
- **Não há envio dos relatórios para terceiros de I.A.** em nenhuma etapa desse fluxo.

---

## 3. Terceiros / subprocessadores (quem toca o dado)

Para transparência total com o compliance, todos os serviços externos que participam:

| Serviço | Papel | Que dado ele vê | Fica armazenado lá? |
|---|---|---|---|
| **Supabase** | Banco de dados (PostgreSQL gerenciado) | Todos os dados do sistema (relatórios importados, cadastros, usuários) | **Sim** — é o repositório oficial. Criptografia em repouso e em trânsito. Possui SOC 2 Type II. |
| **Vercel** | Hospedagem do app + funções de servidor | Dados em trânsito ao processar requisições (login, webhook) | Não armazena dados de negócio (stateless). |
| **Z-API** | Gateway de WhatsApp | Conteúdo das mensagens/imagens trocadas nos grupos de WhatsApp | Conforme política do Z-API (gateway de mensagens). |
| **Anthropic (Claude Haiku)** | Interpreta mensagens do bot | **Texto** das mensagens de motoristas (bot de reposição) + catálogo de produtos | Ver Seção 4. **Não recebe relatórios Ambev.** |
| **Groq (Whisper)** | Transcreve áudios do bot | **Áudio** das mensagens de voz de motoristas | Ver Seção 4. **Não recebe relatórios Ambev.** |

> Recomendação de compliance: para os serviços acima, solicitar/arquivar os respectivos DPAs (Data Processing Agreements) e páginas de trust/segurança. Supabase, Vercel e Anthropic publicam documentação de conformidade.

---

## 4. Uso de I.A. em produção — transparência total

Esta seção existe justamente para o compliance não ser surpreendido. **O bot de WhatsApp usa I.A.**

### 4.1. O que é o bot
No módulo de **Vales/Reposições**, motoristas mandam mensagens em um grupo de WhatsApp pedindo reposição de produto (falta, avaria, inversão, troca). Para entender a mensagem em linguagem livre, o sistema usa I.A.

### 4.2. O que exatamente é enviado, e para quem
- **Para a Anthropic (modelo Claude Haiku):** o **texto** da mensagem do motorista + um catálogo de produtos do PDV (para a I.A. reconhecer o nome certo do produto). Objetivo: extrair de forma estruturada o produto, quantidade, tipo de reposição.
- **Para a Groq (modelo Whisper):** quando o motorista manda **áudio**, o arquivo de voz é enviado para transcrição em texto.

### 4.3. O que **não** é enviado
- ❌ Nenhum relatório do sistema Ambev.
- ❌ Nenhum dado das telas de análise (GSDPQ, DTO, TML, Jornada, Frota, DRE).
- ❌ Nenhuma senha, nenhum cadastro de usuário.

O único dado que chega à I.A. é o **conteúdo da conversa do motorista no grupo de reposição** (texto ou áudio).

### 4.4. Classificação do dado e LGPD
As mensagens podem conter dados pessoais (nome do motorista, código de PDV/cliente). Por isso o fluxo é relevante para a LGPD. Fatos mitigadores e recomendações:
- A **Anthropic**, em seus termos de API comercial, **não usa os dados enviados via API para treinar seus modelos** e oferece controles de retenção. Recomenda-se validar/arquivar o DPA da Anthropic.
- Para a **Groq**, recomenda-se revisar os termos de tratamento/retenção de dados de áudio e, se necessário para o compliance, avaliar alternativa com DPA formal.
- O uso de I.A. no bot é **opcional e desativável**: sem as chaves de API configuradas, o bot simplesmente pede que o motorista mande por texto/formato estruturado, e **nenhum dado vai para I.A.**

### 4.5. Opções para o compliance decidir
1. **Manter como está**, com os DPAs de Anthropic/Groq arquivados e este relatório de transparência.
2. **Restringir** o bot a transcrição/interpretação apenas onde não houver PII sensível.
3. **Desativar** a I.A. do bot (remover as chaves), mantendo o fluxo manual/estruturado — zero I.A. em produção.

---

## 5. Controles de segurança implementados (rodada atual)

Correções já aplicadas e em produção nesta rodada de hardening:

| Área | Antes | Depois |
|---|---|---|
| **Autenticação** | Senhas em **texto puro** no banco; login validado no navegador | Login validado **no servidor**; senhas convertidas para **hash (scrypt)** de forma transparente |
| **Sessão** | Sessão nunca expirava | **Logout automático por inatividade (30 min)** + expiração absoluta de 12h |
| **Chave de administração** | `service_role` (ignora todas as travas do banco) **embutida no código público** | **Removida do front**; fica apenas no servidor |
| **Tabela de usuários** | Legível por qualquer um com a chave pública | **Fechada**: acesso só pelo servidor autenticado |
| **Webhook do WhatsApp** | Aceitava qualquer requisição | Exige **segredo obrigatório**; valida a origem |
| **Exposição de CPF** | Totem retornava CPF completo | **CPF mascarado** |
| **Injeção** | Filtro de consulta montado com entrada externa | **Validação de entrada** aplicada |

> Um relatório técnico detalhado dessas correções (`SECURITY_REPORT.md`), com arquivo e linha de cada item, está disponível no repositório para o time de T.I.

---

## 6. Riscos residuais (transparência) e plano

Nada é omitido. Itens em aberto, por severidade:

| Item | Severidade | Situação / Plano |
|---|---|---|
| Rotação da chave `service_role` antiga | Média | Programada para janela de manutenção (a chave antiga esteve exposta antes da correção). |
| Biblioteca de leitura de planilha (`xlsx`) com CVEs conhecidas | Média | Sem correção oficial disponível; avaliar troca de biblioteca. Entrada é arquivo de usuário autenticado. |
| Rate limiting em rotas públicas (login, totem) | Média | A implementar — proteção contra força bruta/enumeração. |
| Demais tabelas com política de acesso ampla | Baixa | Sem PII crítica (CPF/senha já tratados). Revisão caso a caso planejada. |
| Mensagens de erro técnicas na tela | Baixa | Padronizar mensagens genéricas. |

---

## 7. Recomendações para a apresentação ao compliance

1. **Apresentar a distinção da Seção 1.2 de forma explícita:** relatórios Ambev **não** vão para I.A.; o único uso de I.A. em produção é o bot de WhatsApp (mensagens de motorista), disclosado e controlável.
2. **Levar os DPAs/trust pages** de Supabase, Vercel, Anthropic e Z-API (e revisar Groq).
3. **Mostrar o hardening já feito** (Seção 5) como evidência de maturidade e resposta rápida.
4. **Mostrar o plano dos residuais** (Seção 6) — assumir o que falta demonstra transparência, não fraqueza.
5. Se o compliance exigir **zero I.A. em produção**, a opção 3 da Seção 4.5 (desativar a I.A. do bot) é viável sem afetar os relatórios Ambev.

---

## 8. Ressalva

Este documento é uma **avaliação técnica** produzida para apoiar a análise de compliance. **Não substitui** uma auditoria independente certificada nem parecer jurídico de LGPD. As políticas dos provedores terceiros (Supabase, Vercel, Z-API, Anthropic, Groq) devem ser confirmadas diretamente nas fontes oficiais na data da apresentação.
