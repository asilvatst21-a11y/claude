export type StateData = {
  uf: string;
  name: string;
  cities: string[];
};

export const BRAZIL_STATES: StateData[] = [
  {
    uf: "AC", name: "Acre",
    cities: ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira", "Tarauacá", "Feijó", "Brasileia", "Epitaciolândia"],
  },
  {
    uf: "AL", name: "Alagoas",
    cities: ["Maceió", "Arapiraca", "Palmeira dos Índios", "União dos Palmares", "Penedo", "Rio Largo", "Santana do Ipanema", "Delmiro Gouveia", "São Miguel dos Campos"],
  },
  {
    uf: "AM", name: "Amazonas",
    cities: ["Manaus", "Parintins", "Itacoatiara", "Manacapuru", "Coari", "Tefé", "Tabatinga", "Maués", "Humaitá", "Presidente Figueiredo"],
  },
  {
    uf: "AP", name: "Amapá",
    cities: ["Macapá", "Santana", "Laranjal do Jari", "Oiapoque", "Mazagão", "Porto Grande"],
  },
  {
    uf: "BA", name: "Bahia",
    cities: [
      "Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro", "Ilhéus",
      "Lauro de Freitas", "Barreiras", "Jequié", "Porto Seguro", "Simões Filho", "Alagoinhas",
      "Eunápolis", "Paulo Afonso", "Itabuna", "Teixeira de Freitas", "Santo Antônio de Jesus",
      "Serrinha", "Valença", "Guanambi", "Brumado", "Cruz das Almas", "Senhor do Bonfim",
      "Jacobina", "Itaberaba", "Candeias", "Dias d'Ávila",
    ],
  },
  {
    uf: "CE", name: "Ceará",
    cities: [
      "Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral", "Crato", "Itapipoca",
      "Maranguape", "Iguatu", "Quixadá", "Pacatuba", "Camocim", "Tianguá", "Aquiraz",
      "Horizonte", "Eusébio", "Russas", "Limoeiro do Norte", "Crateús",
    ],
  },
  {
    uf: "DF", name: "Distrito Federal",
    cities: ["Brasília", "Ceilândia", "Taguatinga", "Samambaia", "Planaltina", "Águas Claras", "Guará", "Gama", "Sobradinho", "Recanto das Emas", "Santa Maria", "Riacho Fundo"],
  },
  {
    uf: "ES", name: "Espírito Santo",
    cities: ["Vitória", "Serra", "Vila Velha", "Cariacica", "Linhares", "Cachoeiro de Itapemirim", "Colatina", "Guarapari", "São Mateus", "Aracruz", "Viana", "Nova Venécia", "Barra de São Francisco"],
  },
  {
    uf: "GO", name: "Goiás",
    cities: [
      "Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia", "Águas Lindas de Goiás",
      "Valparaíso de Goiás", "Trindade", "Formosa", "Novo Gama", "Itumbiara", "Senador Canedo",
      "Catalão", "Jataí", "Planaltina", "Caldas Novas", "Goianésia", "Mineiros",
    ],
  },
  {
    uf: "MA", name: "Maranhão",
    cities: [
      "São Luís", "Imperatriz", "São José de Ribamar", "Timon", "Caxias", "Codó",
      "Paço do Lumiar", "Açailândia", "Bacabal", "Balsas", "Santa Inês", "Pinheiro",
      "Chapadinha", "Itapecuru Mirim", "São Raimundo Nonato",
    ],
  },
  {
    uf: "MG", name: "Minas Gerais",
    cities: [
      "Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros",
      "Ribeirão das Neves", "Uberaba", "Governador Valadares", "Ipatinga", "Sete Lagoas",
      "Divinópolis", "Patos de Minas", "Santa Luzia", "Poços de Caldas", "Sabará",
      "Ibirité", "Vespasiano", "Coronel Fabriciano", "Timóteo", "Teófilo Otoni",
      "Pouso Alegre", "Varginha", "Itabira", "Passos", "Muriaé", "Viçosa",
      "Barbacena", "Lavras", "Araxá", "Ituiutaba", "Ouro Preto", "Mariana",
      "Alfenas", "Caratinga", "Três Corações", "Conselheiro Lafaiete",
    ],
  },
  {
    uf: "MS", name: "Mato Grosso do Sul",
    cities: ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá", "Ponta Porã", "Naviraí", "Nova Andradina", "Aquidauana", "Sidrolândia", "Maracaju"],
  },
  {
    uf: "MT", name: "Mato Grosso",
    cities: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop", "Tangará da Serra", "Sorriso", "Cáceres", "Lucas do Rio Verde", "Primavera do Leste", "Alta Floresta", "Barra do Garças"],
  },
  {
    uf: "PA", name: "Pará",
    cities: [
      "Belém", "Ananindeua", "Santarém", "Marabá", "Parauapebas", "Castanhal", "Abaetetuba",
      "Cametá", "Altamira", "Bragança", "Barcarena", "Benevides", "Marituba", "Tucuruí",
      "Redenção", "Itaituba", "Paragominas", "Tomé-Açu",
    ],
  },
  {
    uf: "PB", name: "Paraíba",
    cities: ["João Pessoa", "Campina Grande", "Santa Rita", "Patos", "Bayeux", "Sousa", "Cajazeiras", "Cabedelo", "Guarabira", "Mossoró", "Queimadas"],
  },
  {
    uf: "PE", name: "Pernambuco",
    cities: [
      "Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina", "Paulista",
      "Cabo de Santo Agostinho", "Camaragibe", "Garanhuns", "Vitória de Santo Antão",
      "Igarassu", "Santa Cruz do Capibaribe", "Abreu e Lima", "Araripina",
      "Ipojuca", "Carpina", "Caetés", "Serra Talhada",
    ],
  },
  {
    uf: "PI", name: "Piauí",
    cities: ["Teresina", "Parnaíba", "Picos", "Piripiri", "Floriano", "Campo Maior", "Barras", "União", "São Raimundo Nonato", "Oeiras"],
  },
  {
    uf: "PR", name: "Paraná",
    cities: [
      "Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais",
      "Foz do Iguaçu", "Colombo", "Guarapuava", "Paranaguá", "Araucária", "Toledo",
      "Apucarana", "Pinhais", "Campo Largo", "Almirante Tamandaré", "Umuarama",
      "Cambé", "São Carlos do Ivaí", "Piraquara", "Sarandi", "Francisco Beltrão",
      "Paranavaí", "Cianorte", "Jacarezinho", "Cornélio Procópio",
    ],
  },
  {
    uf: "RJ", name: "Rio de Janeiro",
    cities: [
      "Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói",
      "Belford Roxo", "Campos dos Goytacazes", "São João de Meriti", "Petrópolis",
      "Volta Redonda", "Magé", "Macaé", "Itaboraí", "Mesquita", "Nilópolis",
      "Nova Friburgo", "Angra dos Reis", "Cabo Frio", "Teresópolis", "Maricá",
      "Rio das Ostras", "Queimados", "Araruama", "Barra Mansa", "Resende",
      "Três Rios", "Seropédica", "Japeri", "Guapimirim", "Paracambi",
      "Itaguaí", "Mangaratiba", "Paraty", "São Pedro da Aldeia", "Armação dos Búzios",
      "Arraial do Cabo", "Saquarema", "Rio Bonito", "Cachoeiras de Macacu",
      "Vassouras", "Barra do Piraí", "Valença", "Piraí", "Porto Real",
    ],
  },
  {
    uf: "RN", name: "Rio Grande do Norte",
    cities: ["Natal", "Mossoró", "Parnamirim", "São Gonçalo do Amarante", "Macaíba", "Ceará-Mirim", "Caicó", "Assu", "Currais Novos", "Santa Cruz"],
  },
  {
    uf: "RO", name: "Rondônia",
    cities: ["Porto Velho", "Ji-Paraná", "Ariquemes", "Vilhena", "Cacoal", "Rolim de Moura", "Guajará-Mirim", "Jaru", "Ouro Preto do Oeste"],
  },
  {
    uf: "RR", name: "Roraima",
    cities: ["Boa Vista", "Rorainópolis", "Caracaraí", "Alto Alegre", "Mucajaí"],
  },
  {
    uf: "RS", name: "Rio Grande do Sul",
    cities: [
      "Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria", "Gravataí",
      "Viamão", "Novo Hamburgo", "São Leopoldo", "Rio Grande", "Alvorada", "Passo Fundo",
      "Sapucaia do Sul", "Uruguaiana", "Santa Cruz do Sul", "Cachoeirinha", "Bagé",
      "Bento Gonçalves", "Erechim", "Sapiranga", "Montenegro", "Lajeado", "Guaíba",
      "Camaquã", "Cachoeira do Sul", "Santana do Livramento", "Cruz Alta", "Ijuí",
      "Santa Rosa", "Alegrete", "Farroupilha", "Frederico Westphalen",
    ],
  },
  {
    uf: "SC", name: "Santa Catarina",
    cities: [
      "Florianópolis", "Joinville", "Blumenau", "São José", "Criciúma", "Chapecó",
      "Itajaí", "Lages", "Jaraguá do Sul", "Palhoça", "Balneário Camboriú", "Biguaçu",
      "São Bento do Sul", "Caçador", "Concórdia", "Tubarão", "Araranguá",
      "Navegantes", "Brusque", "Gaspar", "Rio do Sul", "Indaial", "Camboriú",
      "Içara", "Canoinhas", "São Francisco do Sul", "Mafra",
    ],
  },
  {
    uf: "SE", name: "Sergipe",
    cities: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto", "Itabaiana", "São Cristóvão", "Estância", "Tobias Barreto", "Simão Dias"],
  },
  {
    uf: "SP", name: "São Paulo",
    cities: [
      "São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André",
      "Osasco", "São José dos Campos", "Ribeirão Preto", "Sorocaba", "Mauá",
      "Santos", "Mogi das Cruzes", "Diadema", "Jundiaí", "Carapicuíba",
      "Piracicaba", "Bauru", "Itaquaquecetuba", "São José do Rio Preto", "Franca",
      "Guarujá", "Limeira", "Taubaté", "Praia Grande", "São Caetano do Sul",
      "Suzano", "Taboão da Serra", "Sumaré", "Barueri", "Embu das Artes",
      "Americana", "Cotia", "Jacareí", "Indaiatuba", "Hortolândia",
      "São Vicente", "Araraquara", "São Carlos", "Marília", "Presidente Prudente",
      "Rio Claro", "Araçatuba", "Americana", "Itu", "Itapecerica da Serra",
      "Ferraz de Vasconcelos", "Pindamonhangaba", "Bragança Paulista", "Atibaia",
      "Valinhos", "Vinhedo", "Itatiba", "Salto", "Caçapava", "Lorena",
      "Guaratinguetá", "Cruzeiro", "São Roque", "Itapevi", "Birigui",
      "Catanduva", "Votuporanga", "Jaú", "Botucatu", "Ourinhos",
      "Assis", "Tupã", "Andradina", "Ilhabela", "Caraguatatuba",
      "São Sebastião", "Ubatuba", "Mongaguá", "Itanhaém", "Peruíbe",
      "Cubatão", "Bertioga", "Matão", "Sertãozinho", "Bebedouro",
      "Lins", "Penápolis", "Araras", "Pirassununga", "São João da Boa Vista",
      "Mococa", "Itápolis", "Jaboticabal", "Brodowski", "Batatais",
      "Fernandópolis", "Jales", "São José do Rio Pardo",
    ],
  },
  {
    uf: "TO", name: "Tocantins",
    cities: ["Palmas", "Araguaína", "Gurupi", "Porto Nacional", "Paraíso do Tocantins", "Colinas do Tocantins", "Guaraí", "Dianópolis"],
  },
];

export function getCitiesByState(uf: string): string[] {
  const cities = BRAZIL_STATES.find((s) => s.uf === uf)?.cities ?? [];
  return [...cities].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
