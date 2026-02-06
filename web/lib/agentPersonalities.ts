export interface AgentPersonality {
  name: string;
  style: string;
  description: string;
  avatar: string; // 2-char monogram
}

export const AGENT_PERSONALITIES: AgentPersonality[] = [
  {
    name: "Ace",
    style: "Tight-Aggressive",
    description: "Only plays premium hands but bets them hard",
    avatar: "AC",
  },
  {
    name: "Bluff",
    style: "Loose-Aggressive",
    description: "Plays many hands and applies constant pressure",
    avatar: "BL",
  },
  {
    name: "Calcula",
    style: "Mathematical",
    description: "Pure GTO-based decisions using pot odds and equity",
    avatar: "CA",
  },
  {
    name: "Daring",
    style: "Intuitive",
    description: "Reads opponents and makes hero calls/bluffs",
    avatar: "DA",
  },
  {
    name: "Eagle",
    style: "Nit",
    description: "Ultra-tight, only plays the absolute best hands",
    avatar: "EA",
  },
  {
    name: "Foxworth",
    style: "Creative/Trappy",
    description: "Sets elaborate traps and makes unusual plays",
    avatar: "FX",
  },
  {
    name: "Grinder",
    style: "Positional",
    description: "Exploits position ruthlessly, steals blinds relentlessly",
    avatar: "GR",
  },
  {
    name: "Hustler",
    style: "Calling Station/Sticky",
    description: "Loves to call and see showdowns, rarely folds",
    avatar: "HU",
  },
];
