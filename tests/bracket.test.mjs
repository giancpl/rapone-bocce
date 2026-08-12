import assert from "node:assert/strict";
import test from "node:test";
import { assertBocceScore, availableFields, bracketSize, cascadeCoordinates, firstRoundSlots, MAX_TEAMS, nextMatchCoordinate, repechagePlan, shuffleItems } from "../lib/bracket.ts";

test("every supported team count creates a traversable first round", () => {
  for (let count = 2; count <= MAX_TEAMS; count++) {
    const teams = Array.from({ length: count }, (_, index) => index + 1);
    const size = bracketSize(count), slots = firstRoundSlots(teams);
    assert.equal(slots.length, size);
    assert.equal(new Set(slots.filter(Boolean)).size, count);
    assert.equal(slots.filter(slot => slot === null).length, size - count);
    for (let index = 0; index < slots.length; index += 2) assert.ok(slots[index] || slots[index + 1], count + " teams: empty first-round match");
  }
});

test("invalid team counts and bocce scores are rejected", () => {
  for (const count of [0, 1, MAX_TEAMS + 1, 3.5]) assert.throws(() => bracketSize(count));
  for (const score of [[10, 0], [11, 11], [15, 2], [-1, 11], [11.5, 2]]) assert.throws(() => assertBocceScore(score[0], score[1]));
  assert.doesNotThrow(() => assertBocceScore(11, 0));
  assert.doesNotThrow(() => assertBocceScore(14, 13));
});

test("next slots and two-field scheduling remain deterministic", () => {
  assert.deepEqual(nextMatchCoordinate(1, 0), { round: 2, position: 0, slot: "a" });
  assert.deepEqual(nextMatchCoordinate(1, 1), { round: 2, position: 0, slot: "b" });
  assert.deepEqual(availableFields([1, null]), [2]);
  assert.deepEqual(availableFields([1, 2]), []);
  assert.deepEqual(availableFields([]), [1, 2]);
});


test("repechage plans select exactly the pairs needed to complete each bracket", () => {
  assert.deepEqual(repechagePlan(10), { size: 16, preliminaryMatches: 2, byeSlots: 6, selections: 2 });
  assert.deepEqual(repechagePlan(13), { size: 16, preliminaryMatches: 5, byeSlots: 3, selections: 3 });
  assert.deepEqual(repechagePlan(7), { size: 8, preliminaryMatches: 3, byeSlots: 1, selections: 1 });
  assert.deepEqual(repechagePlan(16), { size: 16, preliminaryMatches: 8, byeSlots: 0, selections: 0 });
});

test("draw shuffle keeps every pair and changes their order with a supplied random source", () => {
  const teams = ["A", "B", "C", "D", "E"];
  const shuffled = shuffleItems(teams, () => 0);
  assert.deepEqual(teams, ["A", "B", "C", "D", "E"]);
  assert.deepEqual([...shuffled].sort(), teams);
  assert.notDeepEqual(shuffled, teams);
});


test("a result correction identifies only the dependent branch", () => {
  assert.deepEqual(cascadeCoordinates(1, 0, 4), [{ round: 2, position: 0 }, { round: 3, position: 0 }, { round: 4, position: 0 }]);
  assert.deepEqual(cascadeCoordinates(2, 3, 4), [{ round: 3, position: 1 }, { round: 4, position: 0 }]);
});
