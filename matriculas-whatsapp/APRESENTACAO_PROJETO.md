# Painel Analítico LOG20 — Apresentação do Projeto
### Automação, análise e conexão de atividades da operação

**Data:** 08/07/2026
**Público:** Gestão / Time Ambev

---

## 1. O que é

Um painel único que centraliza os relatórios da operação (extraídos do sistema Ambev e de outras fontes), transforma cada um em **análise pronta** e **conecta as atividades** — de forma que um dado importado **uma vez** alimenta várias telas e dispara ações automáticas (mensagens, alertas, notificações) sem retrabalho manual.

**Princípio central da economia de tempo:**
> Importa-se o relatório **uma vez**. A partir dele, o sistema **calcula as análises**, **compartilha o dado entre as abas** e **aciona as pessoas certas automaticamente** — eliminando o ciclo "abrir relatório → montar planilha → digitar resumo → mandar no WhatsApp".

---

## 2. Módulos (as guias) por área

### 🛡️ Segurança & Gente
| Guia | Para que serve |
|---|---|
| Início | Visão geral / indicadores do dia |
| Matrículas | Cadastro e situação de matrículas |
| Clientes / PDVs | Base de clientes |
| Disparos / Histórico | Comunicação e rastro de mensagens |
| Análise GSDPQ | Gestão de saúde/documentação do colaborador, com **farol de vencimento (30/60 dias)** |
| Análise DTO / Gerenciador DTO | Conformidade de atividades, plano de ação |
| Prontuário | Histórico do colaborador |
| Relatos | Registro de ocorrências |
| Telemetria | Indicadores de direção |
| Excesso de Peso | Controle de peso por placa/rota |
| Controle de Jornada | Jornada de trabalho |

### 🚚 Distribuição
| Guia | Para que serve |
|---|---|
| Carta de Controle TML | Controle estatístico do tempo de matinal |
| Análise TML | Rankings por sala/motorista/motivo, tendência |
| Tempo de Deslocamento | Ideal x realizado, estouros |
| Parâmetros / Config. TML | Metas por dia da semana, gatilhos |
| Timer da Matinal | **Link público** — o time roda o cronômetro no celular |
| DTO Distribuição | Conformidade das atividades da distribuição |
| **Jornada e Tempo em Rota** | Acompanhamento em tempo real da rota, previsão de atraso, carta de controle |
| **Conferência Digital** | **Link público** — ajudante confere os itens do caminhão por baia e registra divergências |

### 🛻 Frota
| Guia | Para que serve |
|---|---|
| Frota / Disponibilidade | Placas disponíveis x indisponíveis, ranking |
| Fixação de Motorista | Aderência motorista↔placa, justificativas |
| IV — DU / Placas | Indicadores e gestão de placas |

### 💰 Financeiro / Vales
| Guia | Para que serve |
|---|---|
| Vales / Ajudantes / Importações | Gestão de vales e ajudantes |
| Reposições | Pedidos de reposição (com **bot de WhatsApp**) |
| Catálogo / Vendas | Base de produtos e vendas do dia |

### 📦 Armazém
| Guia | Para que serve |
|---|---|
| Cadastro de Atividades / Operadores | Estrutura do armazém |
| Dashboard | Produtividade do armazém |
| **Variável** | Cálculo da remuneração variável por cluster de pontuação |
| **Totem** | **Link público** — colaborador consulta a própria variável com 3 dígitos do CPF |

### 📈 Gerência & Admin
| Guia | Para que serve |
|---|---|
| Painel DRE | Resultado gerencial |
| Fluxo Punitivo / Administração | Governança e gestão de acessos |

---

## 3. Onde está a economia de tempo

### 3.1. Compartilhamento do dado entre abas (importar uma vez)
Um mesmo relatório importado alimenta **várias telas de uma vez**:

| Importo… | E automaticamente alimenta… |
|---|---|
| Relatório de saída TML | Carta de Controle + Análise + Tempo de Deslocamento + Histórico + resumo no WhatsApp |
| Relatório GSDPQ | Análise + Farol de Vencimento + notificação de vencimento |
| Relatório de Frota | Disponibilidade + Ranking + Fixação de Motorista + imagem para o grupo |
| Relatório de Separação | Conferência Digital (por baia) |
| Pontuação do Armazém | Dashboard da Variável + Totem do colaborador |

> **Antes:** cada análise era uma planilha separada, remontada à mão a cada dia.
> **Depois:** um upload alimenta todas as telas dependentes, já calculadas.

### 3.2. Conexões de atividade (o sistema aciona a pessoa certa, sozinho)
O maior ganho não é só analisar — é **encadear a ação** sem intervenção manual:

| Fluxo | Conexão automática |
|---|---|
| **GSDPQ → Gente/RH** | Vencimento de documento (30/60 dias) → gera lista e **envia ao grupo responsável** |
| **Jornada e Tempo em Rota → Supervisor** | Detecta rota atrasada → **envia alerta de previsão de atraso direto ao supervisor** |
| **TML → Grupos / Gerência** | A cada import, **resumo automático** ao grupo; fechamento do dia à gerência |
| **Frota → Grupo de Distribuição** | Disponibilidade e fixação → **imagem/resumo enviados ao grupo** |
| **Conferência Digital → Grupo** | Ajudante marca divergência (falta/avaria) → **mensagem automática ao grupo** |
| **Reposição (bot) → Grupo** | Motorista pede no WhatsApp → **bot interpreta e registra/responde** |
| **Variável → Colaborador** | Supervisor sobe a pontuação → **colaborador consulta sozinho no totem** |

> **Antes:** alguém lia o relatório, digitava um resumo e mandava no WhatsApp; o colaborador ligava para saber a variável; a conferência era no papel.
> **Depois:** o sistema gera e envia sozinho; o colaborador se atende por link público.

### 3.3. Autoatendimento por link público (sem ocupar analista)
Três frentes que **tiram trabalho do time**:
- **Timer da Matinal** — o próprio time roda o cronômetro.
- **Conferência Digital** — o ajudante confere a carga pelo celular.
- **Totem da Variável** — o colaborador consulta o próprio valor.

---

## 4. Quadro de impacto (preencher com os números reais da operação)

Sugestão de tabela para a apresentação — os tempos "antes" devem ser preenchidos com a medição real de vocês:

| Atividade | Tempo antes (manual) | Tempo depois (sistema) | Frequência |
|---|---|---|---|
| Montar e enviar resumo TML | ___ min/dia | ~automático | diária |
| Consolidar vencimentos GSDPQ | ___ min/semana | ~automático | semanal |
| Avisar supervisor de rota atrasada | ___ min/ocorrência | ~automático | diária |
| Montar disponibilidade de frota | ___ min/dia | ~automático | diária |
| Conferência de carga (papel → digital) | ___ min/mapa | ___ min/mapa | diária |
| Responder variável ao colaborador | ___ min/consulta | autoatendimento | mensal |

> A economia total = (tempo antes − tempo depois) × frequência × nº de filiais. O sistema já gera esses eventos; basta cronometrar um ciclo "antes" para fechar o número.

---

## 5. Governança e segurança (resumo para a gestão)

- Acesso por **login com permissão por seção**; **logout automático por inatividade**.
- Senhas protegidas por **hash**; validação de login **no servidor**.
- Relatórios do sistema Ambev **não são compartilhados com I.A.** (detalhe no relatório de cibersegurança que acompanha esta apresentação).
- Rodada recente de **hardening de segurança** concluída, com plano para os itens residuais.

---

## 6. Mensagem de fechamento

O projeto transforma **relatório em ação**: um dado entra uma vez e vira análise pronta + acionamento automático da pessoa certa, em várias frentes da operação (Distribuição, Frota, Armazém, Gente). O ganho é **tempo de gestão** (menos consolidação manual), **velocidade de resposta** (alertas na hora) e **padronização** (todos olham o mesmo número).
