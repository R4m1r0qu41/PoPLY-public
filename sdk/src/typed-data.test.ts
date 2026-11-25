import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { achievementTypes, checkpointTypes, stateRegistryDomain } from "./typed-data.ts";

// Read the Solidity source read-only; this test must NOT modify the contract. It exists solely to
// catch the SDK's EIP-712 type definitions drifting from the on-chain StateRegistry typehashes.
const contractSource = readFileSync(
  new URL("../../contracts/src/StateRegistry.sol", import.meta.url),
  "utf8",
);

function encodeType(primaryType: string, fields: readonly { name: string; type: string }[]): string {
  return `${primaryType}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`;
}

function stringInside(constantName: string): string {
  // Matches: <TYPE> ... <constantName> = keccak256(\n "the string" \n);
  const match = new RegExp(`${constantName}\\s*=\\s*keccak256\\(\\s*"([^"]*)"`).exec(contractSource);
  assert.ok(match, `could not locate ${constantName} in StateRegistry.sol`);
  return match[1]!;
}

function constantString(constantName: string): string {
  const match = new RegExp(`constant\\s+${constantName}\\s*=\\s*"([^"]*)"`).exec(contractSource);
  assert.ok(match, `could not locate ${constantName} in StateRegistry.sol`);
  return match[1]!;
}

test("SDK Checkpoint type string matches the contract CHECKPOINT_TYPEHASH", () => {
  assert.equal(
    encodeType("Checkpoint", checkpointTypes.Checkpoint),
    stringInside("CHECKPOINT_TYPEHASH"),
  );
});

test("SDK Achievement type string matches the contract ACHIEVEMENT_TYPEHASH", () => {
  assert.equal(
    encodeType("Achievement", achievementTypes.Achievement),
    stringInside("ACHIEVEMENT_TYPEHASH"),
  );
});

test("SDK domain name/version match the contract NAME/VERSION", () => {
  const domain = stateRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  assert.equal(domain.name, constantString("NAME"));
  assert.equal(domain.version, constantString("VERSION"));
});
