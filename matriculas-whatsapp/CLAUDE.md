# Convenções do projeto

## Formato de data exibida na tela: dd/mm/aa

Toda data mostrada na interface (tabelas, cards, listas, badges, mensagens de
alerta/confirmação) deve usar o formato **dd/mm/aa** — dia, mês e ano com
2 dígitos. Exemplo: `26/06/26`.

**Use os helpers existentes em vez de formatar manualmente:**

- `formatarDataBR` em `src/lib/utils.ts` — helper padrão do projeto. Aceita
  `Date`, string ISO (`yyyy-mm-dd` ou timestamptz) ou string já em
  `dd/mm/yyyy`. Retorna `'—'` para valor nulo/inválido.
- `formatDateBR` em `src/lib/valesUtils.ts` — equivalente usado nas páginas
  do módulo de vales (`src/pages/vales/**`). Já concatena `T00:00:00`
  internamente; não anexe sufixo de horário ao chamar.

Não crie um novo formatador de data local em uma página/componente — importe
um dos helpers acima. Se nenhum dos dois servir para o caso (ex.: precisa de
hora junto), inclua `{ day: '2-digit', month: '2-digit', year: '2-digit' }`
explicitamente nas opções do `toLocaleDateString('pt-BR', ...)`.

**O que NÃO deve ser alterado para dd/mm/aa:**

- Valores armazenados, comparados, filtrados ou ordenados (ex.: campos ISO
  usados em queries do Supabase, chaves de agrupamento, `data_aplicacao`
  vindo de import de Excel). Esses continuam no formato original — a
  conversão para dd/mm/aa é só na exibição.
- Nomes de arquivo gerados em exportações (CSV/XLSX/PNG) — mantidos com ano
  de 4 dígitos por já estarem em uso e não serem "tela" de exibição.
- Rótulos de gráfico de tendência que mostram apenas dia/mês (sem ano), pois
  são compactos por design.
- Mensagens de texto enviadas via WhatsApp (ex.: `lib/tmlResumos.ts`), que
  têm formato próprio e não são tela do app.

Ao adicionar uma nova tela ou campo com data, siga essa convenção desde o
início usando o helper apropriado.

## Sem textos explicativos/metodológicos nas telas

Não adicione parágrafos explicando "como isso é calculado", "o que significa
essa métrica" ou "método usado" nas telas (subtítulos de seção, caixas de
aviso tipo "Método:", texto abaixo de um badge explicando o que ele quer
dizer). Esse tipo de texto acumula e vira ruído — cria dúvida em vez de
esclarecer ("aquela interrogação").

A tela deve se explicar sozinha pelo nome da seção, das colunas e dos
badges/pills. Se um número precisa de explicação pra ser entendido, o
problema é o número/label estar mal nomeado, não a falta de um parágrafo
ao lado.

**O que continua permitido** (não é "explicação", é dado):

- Um subtítulo que mostra um valor calculado, ex.: `Total no período: R$
  1.234,56` ou `Total da frota: 12,4 horas` — isso é resultado, não método.
- Mensagens de erro/vazio ("Nenhuma placa conhecida ainda — importe o
  relatório primeiro") — orientam uma ação, não explicam cálculo.

Vale para toda tela nova ou alterada daqui pra frente, não só Consumo de
Combustível.

## Meta é taxa, resultado é total — não misturar

Quando uma tela mostra uma "meta" ao lado de um "resultado" do período
(ex.: Km/L meta vs Km/L real, Meta CO₂ vs CO₂ emitido), a meta deve ser
sempre uma **taxa/constante** (não muda se o período filtrado mudar) — nunca
um total escalado pelos dias/km do período. Um total-como-meta parece
comparável ao resultado mas na verdade se move junto com o filtro de data,
o que confunde quem está lendo.

Exemplo: `metaCo2PorKm` (kg de CO₂ por km, fixo) é a meta certa ao lado de
`co2EmitidoKg` (total do período) — não `metaKg = (km do período ÷ meta) ×
fator`, que cresce ou encolhe conforme o período escolhido.
