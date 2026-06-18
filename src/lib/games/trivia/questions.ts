/**
 * World Cup trivia bank = AUTO-GENERATED questions (winners, final scores,
 * runners-up, final venues, final scorers — derived + fact-checked from
 * openfootball history via `npm run trivia:gen`) MERGED with the hand-curated
 * "flavor" questions below that a dataset can't produce (iconic moments,
 * awards, records, the 1950 round-robin).
 *
 * answerIndex is 0-based into `choices`. To refresh the generated half, run
 * `npm run trivia:gen` and commit questions.generated.ts.
 */
import { GENERATED_QUESTIONS } from "./questions.generated";

export interface TriviaQuestion {
  id: string;
  q: string;
  choices: string[];
  answerIndex: number;
  category: string;
}

/** Hand-written questions for facts the generator can't derive from match data. */
const CURATED_QUESTIONS: TriviaQuestion[] = [
  // 1950 — round-robin, no single final (the generator skips this year).
  { id: "c_1950_w", q: "Who won the 1950 FIFA World Cup?", choices: ["Brazil", "Sweden", "Spain", "Uruguay"], answerIndex: 3, category: "Winners" },
  { id: "c_1950_maracanazo", q: "Uruguay's shock 2-1 win over Brazil to take the 1950 World Cup is known as the…", choices: ["Maracanazo", "Miracle of Bern", "Battle of Berne", "Hand of God"], answerIndex: 0, category: "General" },

  // Records & general knowledge.
  { id: "c_most_titles", q: "Which country has won the most World Cups?", choices: ["Argentina", "Germany", "Italy", "Brazil"], answerIndex: 3, category: "General" },
  { id: "c_top_scorer", q: "Who is the all-time top scorer in World Cup history?", choices: ["Pelé", "Lionel Messi", "Ronaldo Nazário", "Miroslav Klose"], answerIndex: 3, category: "General" },
  { id: "c_first_host", q: "Which country hosted the first ever World Cup, in 1930?", choices: ["France", "Brazil", "Italy", "Uruguay"], answerIndex: 3, category: "General" },
  { id: "c_3_titles_men", q: "Which player has won the World Cup as a player a record three times?", choices: ["Diego Maradona", "Pelé", "Franz Beckenbauer", "Cafu"], answerIndex: 1, category: "General" },

  // Iconic moments.
  { id: "c_hand_of_god", q: "Who scored the 'Hand of God' goal at the 1986 World Cup?", choices: ["Diego Maradona", "Pelé", "Gary Lineker", "Jorge Valdano"], answerIndex: 0, category: "Moments" },
  { id: "c_zidane_2006", q: "Which French player was sent off in the 2006 Final for a headbutt?", choices: ["Thierry Henry", "Zinedine Zidane", "Patrick Vieira", "Franck Ribéry"], answerIndex: 1, category: "Moments" },
  { id: "c_2022_golden_ball", q: "Who won the Golden Ball (best player) at the 2022 World Cup?", choices: ["Kylian Mbappé", "Luka Modrić", "Neymar", "Lionel Messi"], answerIndex: 3, category: "Awards" },
  { id: "c_2022_hattrick", q: "Who scored a hat-trick in the 2022 World Cup Final?", choices: ["Kylian Mbappé", "Julián Álvarez", "Olivier Giroud", "Lionel Messi"], answerIndex: 0, category: "Moments" },
  { id: "c_2018_golden_boot", q: "Who won the Golden Boot (top scorer) at the 2018 World Cup?", choices: ["Cristiano Ronaldo", "Harry Kane", "Romelu Lukaku", "Kylian Mbappé"], answerIndex: 1, category: "Awards" },
  { id: "c_2022_morocco", q: "Which African nation reached the World Cup semi-finals for the first time in 2022?", choices: ["Senegal", "Morocco", "Ghana", "Cameroon"], answerIndex: 1, category: "General" },
];

/** The full bank used by both the online duel and the pass-and-play game. */
export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  ...GENERATED_QUESTIONS,
  ...CURATED_QUESTIONS,
];
