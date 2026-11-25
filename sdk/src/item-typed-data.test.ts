import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  bindingDigest,
  bindingDomain,
  bindingTypes,
  itemDestructionTypes,
  itemIssuanceDigest,
  itemIssuanceTypes,
  itemRegistryDomain,
  itemTransformationTypes,
  signItemIssuance,
  verifyItemIssuanceSignature,
  type BindingRequest,
  type ItemIssuance,
} from "./item-typed-data.ts";

// Read the Solidity sources read-only; these tests exist solely to catch the SDK's EIP-712 type
// definitions drifting from the on-chain ItemRegistry / CharacterItemBinding typehashes.
const registrySource = readFileSync(
  new URL("../../contracts/src/ItemRegistry.sol", import.meta.url),
  "utf8",
);
const bindingSource = readFileSync(
  new URL("../../contracts/src/CharacterItemBinding.sol", import.meta.url),
  "utf8",
);

function encodeType(primaryType: string, fields: readonly { name: string; type: string }[]): string {
  return `${primaryType}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`;
}

function stringInside(source: string, constantName: string): string {
  const match = new RegExp(`${constantName}\\s*=\\s*keccak256\\(\\s*"([^"]*)"`).exec(source);
  assert.ok(match, `could not locate ${constantName}`);
  return match[1]!;
}

function constantString(source: string, constantName: string): string {
  const match = new RegExp(`constant\\s+${constantName}\\s*=\\s*"([^"]*)"`).exec(source);
  assert.ok(match, `could not locate ${constantName}`);
  return match[1]!;
}

test("SDK ItemIssuance type string matches the contract ISSUANCE_TYPEHASH", () => {
  assert.equal(
    encodeType("ItemIssuance", itemIssuanceTypes.ItemIssuance),
    stringInside(registrySource, "ISSUANCE_TYPEHASH"),
  );
});

test("SDK ItemDestruction type string matches the contract DESTRUCTION_TYPEHASH", () => {
  assert.equal(
    encodeType("ItemDestruction", itemDestructionTypes.ItemDestruction),
    stringInside(registrySource, "DESTRUCTION_TYPEHASH"),
  );
});

test("SDK ItemTransformation type string matches the contract TRANSFORMATION_TYPEHASH", () => {
  assert.equal(
    encodeType("ItemTransformation", itemTransformationTypes.ItemTransformation),
    stringInside(registrySource, "TRANSFORMATION_TYPEHASH"),
  );
});

test("SDK Binding type string matches the contract BINDING_TYPEHASH", () => {
  assert.equal(
    encodeType("Binding", bindingTypes.Binding),
    stringInside(bindingSource, "BINDING_TYPEHASH"),
  );
});

test("SDK item/binding domain names and versions match the contracts", () => {
  const registry = itemRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  assert.equal(registry.name, constantString(registrySource, "NAME"));
  assert.equal(registry.version, constantString(registrySource, "VERSION"));
  const binding = bindingDomain(31_337, "0x3000000000000000000000000000000000000003");
  assert.equal(binding.name, constantString(bindingSource, "NAME"));
  assert.equal(binding.version, constantString(bindingSource, "VERSION"));
});

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const issuance: ItemIssuance = {
  itemContract: "0x1000000000000000000000000000000000000001",
  tokenId: 1n,
  gameId: "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393",
  itemClassId: "0x1111111111111111111111111111111111111111111111111111111111111111",
  originHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
  metadataHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
  owner: "0x4000000000000000000000000000000000000004",
  occurredAt: 1_800_000_000n,
  deadline: 1_800_000_900n,
};

test("item issuance signs and verifies round-trip", async () => {
  const domain = itemRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  const signed = await signItemIssuance(account, domain, issuance);
  assert.match(signed.signature, /^0x[0-9a-f]{130}$/);
  assert.equal(await verifyItemIssuanceSignature(domain, signed), true);
  assert.equal(itemIssuanceDigest(domain, issuance).length, 66);
});

test("item issuance validation rejects zero commitments and bad windows", () => {
  const domain = itemRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  assert.throws(
    () => itemIssuanceDigest(domain, { ...issuance, itemClassId: `0x${"0".repeat(64)}` }),
    /cannot be zero/,
  );
  assert.throws(
    () => itemIssuanceDigest(domain, { ...issuance, deadline: issuance.occurredAt - 1n }),
    /deadline cannot precede occurredAt/,
  );
});

test("binding digest validates ownership-shaped fields", () => {
  const domain = bindingDomain(31_337, "0x3000000000000000000000000000000000000003");
  const binding: BindingRequest = {
    characterContract: "0x1000000000000000000000000000000000000001",
    characterId: 1n,
    itemContract: "0x5000000000000000000000000000000000000005",
    itemId: 1n,
    releasable: true,
    occurredAt: 1_800_000_000n,
    deadline: 1_800_000_900n,
  };
  assert.equal(bindingDigest(domain, binding).length, 66);
  assert.throws(
    () => bindingDigest(domain, { ...binding, releasable: "yes" as never }),
    /releasable must be a boolean/,
  );
});
