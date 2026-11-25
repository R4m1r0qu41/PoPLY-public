import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, stateCommitment } from "./canonical-state.ts";

test("bigint encoding is injective against equivalent string and number", () => {
  const asBigint = canonicalJson({ x: 100n });
  const asString = canonicalJson({ x: "100" });
  const asNumber = canonicalJson({ x: 100 });
  const asStringWithMarker = canonicalJson({ x: "100n" });

  // All four representations must be distinct at the canonical-JSON level...
  assert.notEqual(asBigint, asString);
  assert.notEqual(asBigint, asNumber);
  assert.notEqual(asBigint, asStringWithMarker);
  assert.notEqual(asString, asNumber);

  // ...and therefore at the commitment level.
  assert.notEqual(stateCommitment({ x: 100n }), stateCommitment({ x: "100" }));
  assert.notEqual(stateCommitment({ x: 100n }), stateCommitment({ x: 100 }));
  assert.notEqual(stateCommitment({ x: 100n }), stateCommitment({ x: "100n" }));
});

test("canonical key ordering is deterministic", () => {
  const left = canonicalJson({ b: 1n, a: 2n, c: { z: 1, a: 2 } });
  const right = canonicalJson({ c: { a: 2, z: 1 }, a: 2n, b: 1n });
  assert.equal(left, right);
  assert.equal(left, '{"a":2n,"b":1n,"c":{"a":2,"z":1}}');
});

test("cycles are rejected", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic as never), /cycles/);

  const arrayCycle: unknown[] = [];
  arrayCycle.push(arrayCycle);
  assert.throws(() => canonicalJson(arrayCycle as never), /cycles/);
});
