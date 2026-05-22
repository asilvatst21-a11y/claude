export type StateData = {
  uf: string;
  name: string;
  cities: string[];
};

export const BRAZIL_STATES: StateData[] = [
  { uf: "AC", name: "Acre", cities: ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira", "Tarauacá"] },
  { uf: "AL", name: "Alagoas", cities: ["Maceió", "Arapiraca", "Palmeira dos Índios", "União dos Palmares"] },
  { uf: "AM", name: "Amazonas", cities: ["Manaus", "Parintins", "Itacoatiara", "Manacapuru", "Coari"] },
  { uf: "AP", name: "Amapá", cities: ["Macapá", "Santana", "Laranjal do Jari", "Oiapoque"] },
  { uf: "BA", name: "Bahia", cities: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro", "Ilhéus", "Lauro de Freitas", "Barreiras", "Jequié", "Porto Seguro"] },
  { uf: "CE", name: "Ceará", cities: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral", "Crato", "Itapipoca", "Maranguape"] },
  { uf: "DF", name: "Distrito Federal", cities: ["Brasília", "Ceilândia", "Taguatinga", "Samambaia", "Planaltina", "Águas Claras", "Guará", "Gama"] },
  { uf: "ES", name: "Espírito Santo", cities: ["Vitória", "Serra", "Vila Velha", "Cariacica", "Linhares", "Cachoeiro de Itapemirim", "Colatina"] },
  { uf: "GO", name: "Goiás", cities: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia", "Águas Lindas de Goiás", "Valparaíso de Goiás"] },
  { uf: "MA", name: "Maranhão", cities: ["São Luís", "Imperatriz", "São José de Ribamar", "Timon", "Caxias", "Codó", "Paço do Lumiar", "Açailândia"] },
  { uf: "MG", name: "Minas Gerais", cities: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros", "Ribeirão das Neves", "Uberaba", "Governador Valadares", "Ipatinga", "Sete Lagoas", "Divinópolis", "Patos de Minas"] },
  { uf: "MS", name: "Mato Grosso do Sul", cities: ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá", "Grande Dourados", "Ponta Porã"] },
  { uf: "MT", name: "Mato Grosso", cities: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop", "Tangará da Serra", "Sorriso", "Cáceres"] },
  { uf: "PA", name: "Pará", cities: ["Belém", "Ananindeua", "Santarém", "Marabá", "Parauapebas", "Castanhal", "Abaetetuba", "Cametá"] },
  { uf: "PB", name: "Paraíba", cities: ["João Pessoa", "Campina Grande", "Santa Rita", "Patos", "Bayeux", "Sousa", "Cajazeiras"] },
  { uf: "PE", name: "Pernambuco", cities: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina", "Paulista", "Cabo de Santo Agostinho", "Camaragibe", "Garanhuns"] },
  { uf: "PI", name: "Piauí", cities: ["Teresina", "Parnaíba", "Picos", "Piripiri", "Floriano", "Campo Maior"] },
  { uf: "PR", name: "Paraná", cities: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais", "Foz do Iguaçu", "Colombo", "Guarapuava", "Paranaguá"] },
  { uf: "RJ", name: "Rio de Janeiro", cities: ["Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Belford Roxo", "Campos dos Goytacazes", "São João de Meriti", "Petrópolis", "Volta Redonda", "Magé", "Macaé"] },
  { uf: "RN", name: "Rio Grande do Norte", cities: ["Natal", "Mossoró", "Parnamirim", "São Gonçalo do Amarante", "Macaíba", "Ceará-Mirim"] },
  { uf: "RO", name: "Rondônia", cities: ["Porto Velho", "Ji-Paraná", "Ariquemes", "Vilhena", "Cacoal", "Rolim de Moura"] },
  { uf: "RR", name: "Roraima", cities: ["Boa Vista", "Rorainópolis", "Caracaraí", "Alto Alegre"] },
  { uf: "RS", name: "Rio Grande do Sul", cities: ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria", "Gravataí", "Viamão", "Novo Hamburgo", "São Leopoldo", "Rio Grande", "Alvorada", "Passo Fundo"] },
  { uf: "SC", name: "Santa Catarina", cities: ["Florianópolis", "Joinville", "Blumenau", "São José", "Criciúma", "Chapecó", "Itajaí", "Lages", "Jaraguá do Sul", "Palhoça"] },
  { uf: "SE", name: "Sergipe", cities: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto", "Itabaiana", "São Cristóvão"] },
  { uf: "SP", name: "São Paulo", cities: ["São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "São José dos Campos", "Ribeirão Preto", "Sorocaba", "Mauá", "Santos", "Mogi das Cruzes", "Diadema", "Jundiaí", "Carapicuíba", "Piracicaba", "Bauru", "Itaquaquecetuba", "São José do Rio Preto", "Franca", "Guarujá", "Limeira", "Taubaté", "Praia Grande"] },
  { uf: "TO", name: "Tocantins", cities: ["Palmas", "Araguaína", "Gurupi", "Porto Nacional", "Paraíso do Tocantins"] },
];

export function getCitiesByState(uf: string): string[] {
  return BRAZIL_STATES.find((s) => s.uf === uf)?.cities ?? [];
}
