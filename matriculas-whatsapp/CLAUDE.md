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
