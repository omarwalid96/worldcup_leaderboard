import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "../src/lib/games/trivia/questions.ts");

const YEARS = [
  "1930", "1934", "1938", "1950", "1954", "1958", "1962", "1966", "1970",
  "1974", "1978", "1982", "1986", "1990", "1994", "1998", "2002", "2006",
  "2010", "2014", "2018", "2022"
];

// Fallback lists of common strong teams to serve as wrong answers
const TOP_TEAMS = [
  "Brazil", "Germany", "Italy", "Argentina", "France", 
  "Uruguay", "England", "Spain", "Netherlands", "Croatia"
];

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getWrongAnswers(correct, options, count = 3) {
  const choices = new Set([correct]);
  // Try to use provided options first
  const pool = shuffle([...options, ...TOP_TEAMS]).filter(c => c !== correct);
  for (const choice of pool) {
    if (choices.size < count + 1) choices.add(choice);
  }
  const result = Array.from(choices);
  return shuffle(result);
}

async function generate() {
  console.log("Fetching World Cup data...");
  const questions = [];
  let id = 1;

  for (const year of YEARS) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/openfootball/worldcup.json/master/${year}/worldcup.json`);
      if (!res.ok) continue;
      const data = await res.json();
      
      const finals = data.matches?.filter(m => m.round.toLowerCase().includes("final") && !m.round.toLowerCase().includes("quarter") && !m.round.toLowerCase().includes("semi") && !m.round.toLowerCase().includes("third"));
      
      if (finals && finals.length > 0) {
        const finalMatch = finals[0];
        
        let winner, loser, winnerScore, loserScore;
        const ft = finalMatch.score?.ft || [0, 0];
        const p = finalMatch.score?.p || null;

        if (p) {
          // Penalties
          winner = p[0] > p[1] ? finalMatch.team1 : finalMatch.team2;
          loser = p[0] > p[1] ? finalMatch.team2 : finalMatch.team1;
        } else {
          winner = ft[0] > ft[1] ? finalMatch.team1 : finalMatch.team2;
          loser = ft[0] > ft[1] ? finalMatch.team2 : finalMatch.team1;
          winnerScore = Math.max(ft[0], ft[1]);
          loserScore = Math.min(ft[0], ft[1]);
        }

        if (winner && loser) {
          // Q: Who won the year World Cup?
          const q1Choices = getWrongAnswers(winner, [loser]);
          questions.push({
            id: `q${id++}`,
            q: `Who won the ${year} FIFA World Cup?`,
            choices: q1Choices,
            answerIndex: q1Choices.indexOf(winner),
            category: "Winners"
          });

          // Q: Who did X beat in the year final?
          const q2Choices = getWrongAnswers(loser, TOP_TEAMS);
          questions.push({
            id: `q${id++}`,
            q: `Which country did ${winner} beat in the ${year} World Cup Final?`,
            choices: q2Choices,
            answerIndex: q2Choices.indexOf(loser),
            category: "Finals"
          });
          
          if (!p && winnerScore !== undefined) {
             const correctScore = `${winnerScore}-${loserScore}`;
             const fakeScores = [`${winnerScore+1}-${loserScore}`, `${winnerScore}-${loserScore+1}`, "0-0", "1-0", "2-1", "3-2", "4-2"].filter(s => s !== correctScore);
             const q3Choices = shuffle([correctScore, ...shuffle(fakeScores).slice(0, 3)]);
             questions.push({
                id: `q${id++}`,
                q: `What was the final score of the ${year} World Cup Final (excluding penalties)?`,
                choices: q3Choices,
                answerIndex: q3Choices.indexOf(correctScore),
                category: "Finals"
              });
          }
        }
      }
    } catch (e) {
      console.error(`Failed to process ${year}:`, e);
    }
  }

  // Adding some general manual questions for flavor
  const manual = [
    { q: "Which country has won the most World Cups?", a: "Brazil", w: ["Germany", "Italy", "Argentina"] },
    { q: "Who is the all-time top scorer in World Cup history?", a: "Miroslav Klose", w: ["Ronaldo Nazário", "Pelé", "Lionel Messi"] },
    { q: "Which country hosted the first ever World Cup in 1930?", a: "Uruguay", w: ["Brazil", "Italy", "France"] },
    { q: "Who won the Golden Ball for best player at the 2022 World Cup?", a: "Lionel Messi", w: ["Kylian Mbappé", "Luka Modrić", "Neymar"] },
    { q: "Which player scored a hat-trick in the 2022 World Cup Final?", a: "Kylian Mbappé", w: ["Lionel Messi", "Julián Álvarez", "Olivier Giroud"] },
    { q: "Which country has reached the most World Cup finals without ever winning?", a: "Netherlands", w: ["Hungary", "Czechoslovakia", "Sweden"] }
  ];

  for (const m of manual) {
    const choices = shuffle([m.a, ...m.w]);
    questions.push({
      id: `q${id++}`,
      q: m.q,
      choices,
      answerIndex: choices.indexOf(m.a),
      category: "General"
    });
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  
  const fileContent = `/**
 * Generated World Cup Trivia Questions
 * Do not edit this list directly - generated from openfootball data.
 */

export interface TriviaQuestion {
  id: string;
  q: string;
  choices: string[];
  answerIndex: number;
  category: string;
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = ${JSON.stringify(questions, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, fileContent, "utf8");
  console.log(`Generated ${questions.length} questions to ${OUT_FILE}`);
}

generate();
