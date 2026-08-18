import assert from "node:assert/strict";
import {
  makeDeck, evaluateFive, bestPokerHand, compareEvaluations, blackjackTotal,
  createGame, legalPokerActions, pokerAction, drawCards,
  blackjackBet, blackjackInsurance, legalBlackjackActions, blackjackAction,
  sanitizeState
} from "../scripts/engine.js";

const card = id => {
  const found = makeDeck().find(c => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

const royal = evaluateFive(["As","Ks","Qs","Js","Ts"].map(card));
const quads = evaluateFive(["Ah","Ad","Ac","As","2s"].map(card));
assert.equal(royal.label, "Royal Flush");
assert(compareEvaluations(royal, quads) > 0);
assert.equal(bestPokerHand(["As","Ks","Qs","Js","Ts","2d","3d"].map(card)).label, "Royal Flush");
assert.deepEqual(blackjackTotal([card("As"), card("6d")]), { total: 17, soft: true });
assert.deepEqual(blackjackTotal([card("As"), card("6d"), card("Th")]), { total: 17, soft: false });

const seats = [
  { id: "a", ownerUserId: "u1", name: "A" },
  { id: "b", ownerUserId: "u2", name: "B" },
  { id: "c", ownerUserId: "u3", name: "C" }
];
const holdem = createGame("holdem", "h1", "u1", seats, { startingChips: 100, smallBlind: 5, bigBlind: 10 });
assert.equal(holdem.phase, "betting");
let safety = 0;
while (holdem.phase !== "complete" && safety++ < 100) {
  const current = holdem.seats[holdem.currentSeatIndex];
  const legal = legalPokerActions(holdem, current.id);
  if (!legal) throw new Error("No legal action");
  if (legal.canCheck) pokerAction(holdem, current.id, "check");
  else pokerAction(holdem, current.id, "call");
}
assert.equal(holdem.phase, "complete");
assert.equal(holdem.community.length, 5);
assert.equal(holdem.seats.reduce((sum, s) => sum + s.chips, 0), 300);
const privateU1 = sanitizeState(holdem, "u1");
assert(privateU1.seats.find(s => s.id === "a").cards);


const liveHoldem = createGame("holdem", "privacy", "u1", seats, { startingChips: 100, smallBlind: 5, bigBlind: 10 });
const liveViewU1 = sanitizeState(liveHoldem, "u1");
assert(liveViewU1.seats.find(s => s.id === "a").cards?.length === 2);
assert.equal(liveViewU1.seats.find(s => s.id === "b").cards, null);

const sidePot = createGame("holdem", "side", "u1", seats, { startingChips: 100, smallBlind: 5, bigBlind: 10 });
// Force three unequal effective stacks after blinds: A 100, B 50, C 30 total.
sidePot.seats[1].chips = 45;
sidePot.seats[2].chips = 20;
pokerAction(sidePot, "a", "all-in");
pokerAction(sidePot, "b", "all-in");
pokerAction(sidePot, "c", "all-in");
assert.equal(sidePot.phase, "complete");
assert.equal(sidePot.seats.reduce((sum, s) => sum + s.chips, 0), 180);
assert(sidePot.results.length >= 1);

const draw = createGame("draw", "d1", "u1", seats.slice(0, 2), { startingChips: 100, ante: 5, minBet: 10, maxDraw: 3 });
while (draw.phase === "betting" && draw.round === "first-bet") {
  const current = draw.seats[draw.currentSeatIndex];
  const legal = legalPokerActions(draw, current.id);
  pokerAction(draw, current.id, legal.canCheck ? "check" : "call");
}
assert.equal(draw.phase, "draw");
while (draw.phase === "draw") {
  const current = draw.seats[draw.currentSeatIndex];
  drawCards(draw, current.id, []);
}
while (draw.phase === "betting") {
  const current = draw.seats[draw.currentSeatIndex];
  const legal = legalPokerActions(draw, current.id);
  pokerAction(draw, current.id, legal.canCheck ? "check" : "call");
}
assert.equal(draw.phase, "complete");
assert.equal(draw.seats.reduce((sum, s) => sum + s.chips, 0), 200);

const bj = createGame("blackjack", "b1", "u1", seats.slice(0, 2), { startingChips: 100, minBet: 10, maxBet: 100 });
blackjackBet(bj, "a", 10);
blackjackBet(bj, "b", 10);
if (bj.phase === "insurance") {
  blackjackInsurance(bj, "a", 0);
  blackjackInsurance(bj, "b", 0);
}
while (bj.phase === "playing") {
  const current = bj.seats[bj.currentSeatIndex];
  const legal = legalBlackjackActions(bj, current.id);
  blackjackAction(bj, current.id, legal.canStand ? "stand" : "hit");
}
assert.equal(bj.phase, "complete");
assert(bj.seats.every(s => Number.isInteger(s.chips)));


const splitBj = createGame("blackjack", "split", "u1", seats.slice(0, 1), { startingChips: 100, minBet: 10, maxBet: 100 });
blackjackBet(splitBj, "a", 10);
splitBj.phase = "playing";
splitBj.round = "players";
splitBj.currentSeatIndex = 0;
splitBj.currentHandIndex = 0;
splitBj.dealerCards = [card("7s"), card("9h")];
splitBj.seats[0].bjHands[0].cards = [card("8s"), card("8h")];
splitBj.seats[0].bjHands[0].status = "playing";
assert.equal(legalBlackjackActions(splitBj, "a").canSplit, true);
blackjackAction(splitBj, "a", "split");
assert.equal(splitBj.seats[0].bjHands.length, 2);
assert.equal(splitBj.seats[0].chips, 80);

console.log("All engine tests passed.");
