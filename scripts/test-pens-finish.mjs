/**
 * Mark the 2 TEST matches finished + went-to-pens, and grade ONLY the test
 * user's 2 predictions by id. Never calls recomputeLeagueStandings — real
 * standings are untouched. Uses the pure scorePrediction/scorePens from src.
 */
import postgres from "postgres";
import { scorePrediction, scorePens } from "./src/lib/scoring/index.ts";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const M1 = "ffac47dd-7411-4ebf-a752-280a51d1fc0a"; // 1-1, pens won by home (Atlantis)
const M2 = "d348ada9-f8f7-47e7-a5cf-bf9e3cd6d5e6"; // 2-2, pens won by away (Demo Rovers)
const P1 = "a48b81a4-ec2c-4be1-992d-aac581e10904";
const P2 = "66e3d722-2706-4413-8200-d0dbcc46f076";

// Final results: both drew → pens. M1 Atlantis (home) win pens 5-4; M2 Demo Rovers (away) win 4-5.
await sql`update matches set status='finished', went_to_pens=true, pens_home=5, pens_away=4 where id=${M1}`;
await sql`update matches set status='finished', went_to_pens=true, pens_home=4, pens_away=5 where id=${M2}`;

// Grade P1: predicted 1-1 (exact draw, knockout) + pens home correct.
const p1base = scorePrediction({ homePick: 1, awayPick: 1, homeActual: 1, awayActual: 1, isDoubleDown: false, isKnockout: true });
const p1pens = scorePens({ pickWinner: "home", pickHome: null, pickAway: null, actualHome: 5, actualAway: 4 });
const p1 = p1base + p1pens;
await sql`update predictions set points_awarded=${p1}, locked=true, updated_at=now() where id=${P1}`;

// Grade P2: predicted 1-0 (wrong, actual 2-2) + pens away correct.
const p2base = scorePrediction({ homePick: 1, awayPick: 0, homeActual: 2, awayActual: 2, isDoubleDown: false, isKnockout: true });
const p2pens = scorePens({ pickWinner: "away", pickHome: null, pickAway: null, actualHome: 4, actualAway: 5 });
const p2 = p2base + p2pens;
await sql`update predictions set points_awarded=${p2}, locked=true, updated_at=now() where id=${P2}`;

console.log(`M1 finished: pens 5-4 Atlantis. P1 = ${p1base} base + ${p1pens} pens = ${p1} (expect 4)`);
console.log(`M2 finished: pens 4-5 Demo Rovers. P2 = ${p2base} base + ${p2pens} pens = ${p2} (expect 1)`);
console.log("Refresh as omar → Matches → Finished tab.");
await sql.end();
