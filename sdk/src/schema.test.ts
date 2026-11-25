import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Ajv2020 = (require("ajv/dist/2020") as typeof import("ajv/dist/2020.js")).default;
const addFormats = (require("ajv-formats") as typeof import("ajv-formats")).default;

const address = "0x1000000000000000000000000000000000000001";
const bytes32 = `0x${"ab".repeat(32)}`;

const samples: Record<string, unknown> = {
  "character-metadata.schema.json": {
    schemaVersion: "1.0.0",
    gameId: bytes32,
    characterId: "ember-001",
    name: "Ember",
    description: "Reference arena character",
    media: { image: "https://assets.example/ember.png" },
    attributes: [{ trait: "origin", value: "reference-arena" }],
  },
  "checkpoint.schema.json": {
    characterContract: address,
    tokenId: "1",
    gameId: bytes32,
    sequence: "1",
    stateHash: bytes32,
    playTimeSeconds: "3600",
    popl: 1,
    policyId: bytes32,
    occurredAt: "1800000000",
    deadline: "1800000900",
  },
  "achievement.schema.json": {
    characterContract: address,
    tokenId: "1",
    gameId: bytes32,
    achievementId: bytes32,
    evidenceHash: bytes32,
    occurredAt: "1800000000",
    deadline: "1800000900",
  },
  "marketplace-listing.schema.json": {
    schemaVersion: "1.0.0",
    characterContract: address,
    tokenId: "1",
    seller: address,
    priceWei: "1000000000000000000",
    deadline: "1800000900",
  },
  "license-offer.schema.json": {
    schemaVersion: "1.0.0",
    characterContract: address,
    tokenId: "1",
    licensor: address,
    allowedLicensee: null,
    mode: "NPC",
    priceWei: "1000000000000000000",
    durationSeconds: "3600",
    deadline: "1800000900",
    termsHash: bytes32,
  },
  "ai-agent-profile.schema.json": {
    schemaVersion: "1.0.0",
    characterContract: address,
    tokenId: "1",
    gameId: bytes32,
    licenseId: "1",
    licenseExpiresAt: "1800003600",
    operatorId: "reference-publisher",
    behaviorManifest: {
      uri: "https://assets.example/behaviors/ember-v1.json",
      contentHash: bytes32,
    },
    capabilities: ["DIALOGUE", "QUEST_GIVER"],
    prohibitedCapabilities: ["REAL_MONEY_TRADING"],
    safetyPolicyId: bytes32,
  },
  "phygital-binding.schema.json": {
    schemaVersion: "1.0.0",
    bindingId: bytes32,
    characterContract: address,
    tokenId: "1",
    issuer: address,
    devicePublicKey: `0x04${"ab".repeat(32)}`,
    productId: "figure-ember-001",
    manufacturingBatch: "2026-A",
    issuedAt: "1800000000",
    attestation: `0x${"cd".repeat(65)}`,
    revocationUrl: "https://issuer.example/revocations/ember-001",
  },
};

test("all PoPLY JSON Schemas compile and accept their reference sample", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const [name, sample] of Object.entries(samples)) {
    const schema = JSON.parse(
      await readFile(new URL(`../../schemas/${name}`, import.meta.url), "utf8"),
    ) as object;
    const validate = ajv.compile(schema);
    assert.equal(validate(sample), true, `${name}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("character schema rejects undeclared personal-data fields", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(
    await readFile(new URL("../../schemas/character-metadata.schema.json", import.meta.url), "utf8"),
  ) as object;
  const validate = ajv.compile(schema);
  const unsafe = { ...(samples["character-metadata.schema.json"] as object), playerEmail: "player@example.com" };
  assert.equal(validate(unsafe), false);
  assert.match(ajv.errorsText(validate.errors), /additional properties/);
});
