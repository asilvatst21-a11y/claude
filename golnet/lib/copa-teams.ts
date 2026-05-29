export type CopaTeam = {
  id: string;
  name: string;
  flag: string;
  accent: string;       // UI accent (brand text, active nav items)
  bannerBg: string;     // banner gradient center color
  bannerBorder: string; // banner bottom border
  bannerText: string;   // banner text color
};

export const COPA_TEAMS: CopaTeam[] = [
  { id: "brasil",     name: "Brasil",         flag: "🇧🇷", accent: "#FFDF00", bannerBg: "#009C3B", bannerBorder: "#FFDF00", bannerText: "#FFFFFF" },
  { id: "argentina",  name: "Argentina",      flag: "🇦🇷", accent: "#74ACDF", bannerBg: "#74ACDF", bannerBorder: "#FFFFFF", bannerText: "#000C47" },
  { id: "franca",     name: "França",         flag: "🇫🇷", accent: "#8AAAE5", bannerBg: "#002395", bannerBorder: "#ED2939", bannerText: "#FFFFFF" },
  { id: "alemanha",   name: "Alemanha",       flag: "🇩🇪", accent: "#DD0000", bannerBg: "#1A1A1A", bannerBorder: "#DD0000", bannerText: "#FFFFFF" },
  { id: "portugal",   name: "Portugal",       flag: "🇵🇹", accent: "#FF5555", bannerBg: "#006600", bannerBorder: "#FF0000", bannerText: "#FFFFFF" },
  { id: "espanha",    name: "Espanha",        flag: "🇪🇸", accent: "#F1BF00", bannerBg: "#AA151B", bannerBorder: "#F1BF00", bannerText: "#FFFFFF" },
  { id: "inglaterra", name: "Inglaterra",     flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", accent: "#CF091D", bannerBg: "#CF091D", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "holanda",    name: "Holanda",        flag: "🇳🇱", accent: "#FF6A00", bannerBg: "#FF4F00", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "belgica",    name: "Bélgica",        flag: "🇧🇪", accent: "#EF3340", bannerBg: "#1A1A1A", bannerBorder: "#FDDA24", bannerText: "#FFFFFF" },
  { id: "uruguai",    name: "Uruguai",        flag: "🇺🇾", accent: "#74ACDF", bannerBg: "#5B9BD5", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "colombia",   name: "Colômbia",       flag: "🇨🇴", accent: "#FCD116", bannerBg: "#1A2E6E", bannerBorder: "#FCD116", bannerText: "#FFFFFF" },
  { id: "mexico",     name: "México",         flag: "🇲🇽", accent: "#00C468", bannerBg: "#006847", bannerBorder: "#CE1126", bannerText: "#FFFFFF" },
  { id: "eua",        name: "EUA",            flag: "🇺🇸", accent: "#8AAAE5", bannerBg: "#002868", bannerBorder: "#BF0A30", bannerText: "#FFFFFF" },
  { id: "japao",      name: "Japão",          flag: "🇯🇵", accent: "#DC143C", bannerBg: "#00439C", bannerBorder: "#BC002D", bannerText: "#FFFFFF" },
  { id: "coreia",     name: "Coreia do Sul",  flag: "🇰🇷", accent: "#CD2E3A", bannerBg: "#003478", bannerBorder: "#CD2E3A", bannerText: "#FFFFFF" },
  { id: "marrocos",   name: "Marrocos",       flag: "🇲🇦", accent: "#C1272D", bannerBg: "#006233", bannerBorder: "#C1272D", bannerText: "#FFFFFF" },
  { id: "canada",     name: "Canadá",         flag: "🇨🇦", accent: "#FF4444", bannerBg: "#C8102E", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "australia",  name: "Austrália",      flag: "🇦🇺", accent: "#FFCD00", bannerBg: "#00843D", bannerBorder: "#FFCD00", bannerText: "#FFFFFF" },
  { id: "nigeria",    name: "Nigéria",        flag: "🇳🇬", accent: "#00C468", bannerBg: "#008751", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "senegal",    name: "Senegal",        flag: "🇸🇳", accent: "#FDEF42", bannerBg: "#00853F", bannerBorder: "#FDEF42", bannerText: "#FFFFFF" },
  { id: "croacia",    name: "Croácia",        flag: "🇭🇷", accent: "#FF4444", bannerBg: "#C8102E", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "suica",      name: "Suíça",          flag: "🇨🇭", accent: "#FF4444", bannerBg: "#FF0000", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "chile",      name: "Chile",          flag: "🇨🇱", accent: "#D52B1E", bannerBg: "#D52B1E", bannerBorder: "#FFFFFF", bannerText: "#FFFFFF" },
  { id: "equador",    name: "Equador",        flag: "🇪🇨", accent: "#FFDA00", bannerBg: "#007934", bannerBorder: "#FFDA00", bannerText: "#FFFFFF" },
];

export const DEFAULT_TEAM = COPA_TEAMS[0]; // Brasil
