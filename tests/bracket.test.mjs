import assert from "node:assert/strict";
import test from "node:test";
import { assertBocceScore, availableFields, bracketSize, firstRoundSlots, MAX_TEAMS, nextMatchCoordinate } from "../lib/bracket.ts";

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
