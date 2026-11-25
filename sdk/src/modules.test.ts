import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAnalyticsSink, ProtocolAnalytics } from "./analytics.ts";
import { readCharacter } from "./character-registry.ts";
import { MemoryIdentityResolver } from "./identity.ts";
import { createLicenseOffer, isCharacterLocked } from "./licensing-client.ts";
import { buyListing, createListing } from "./marketplace-client.ts";

const character = "0x1000000000000000000000000000000000000001" as const;
const protocol = "0x2000000000000000000000000000000000000002" as const;
const player = "0x3000000000000000000000000000000000000003" as const;
const gameId = `0x${"ab".repeat(32)}` as const;

test("identity resolver supports one-way migration without storing keys", async () => {
  const resolver = new MemoryIdentityResolver();
  resolver.register({
    publisherPlayerId: "player:reference:1",
    address: player,
    custodyMode: "publisher-managed",
    createdAt: 1_800_000_000n,
  });
  resolver.migrateToPlayerControl("player:reference:1", character);
  const identity = await resolver.resolve("player:reference:1");
  assert.equal(identity?.custodyMode, "player-controlled");
  assert.equal(identity?.address, character);
  assert.equal("privateKey" in (identity ?? {}), false);
  assert.throws(() => resolver.migrateToPlayerControl("player:reference:1", player), /already/);
});

test("analytics rejects fields likely to contain personal data", async () => {
  const sink = new MemoryAnalyticsSink();
  const analytics = new ProtocolAnalytics(sink);
  await analytics.record({
    name: "checkpoint_issued",
    occurredAt: 1_800_000_000n,
    correlationId: "match:reference:001",
    attributes: { sequence: 1, popl: 0 },
  });
  assert.equal(sink.events.length, 1);
  await assert.rejects(
    analytics.record({
      name: "character_minted",
      occurredAt: 1_800_000_000n,
      correlationId: "mint:reference:001",
      attributes: { playerEmail: "not-allowed" },
    }),
    /potentially personal/,
  );

  // A personal value hiding behind a benign key is rejected too.
  await assert.rejects(
    analytics.record({
      name: "character_minted",
      occurredAt: 1_800_000_000n,
      correlationId: "mint:reference:002",
      attributes: { note: "reach me at player@example.com" },
    }),
    /value is potentially personal/,
  );
  await assert.rejects(
    analytics.record({
      name: "character_minted",
      occurredAt: 1_800_000_000n,
      correlationId: "mint:reference:003",
      attributes: { origin: "203.0.113.42" },
    }),
    /value is potentially personal/,
  );

  // Structural keys that merely contain PII fragments must NOT false-positive.
  await analytics.record({
    name: "marketplace_settled",
    occurredAt: 1_800_000_000n,
    correlationId: "settle:reference:001",
    attributes: { recipient: "0xabc", username: "arena-42", equipment: "ember-blade" },
  });
  assert.equal(sink.events.length, 2);
});

test("character, licensing, and marketplace clients preserve contract arguments", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const writer = {
    async writeContract(request: Record<string, unknown>) {
      writes.push(request);
      return `0x${"12".repeat(32)}`;
    },
  };
  const reader = {
    async readContract(request: { functionName: string }) {
      if (request.functionName === "ownerOf") return player;
      if (request.functionName === "gameIdOf") return gameId;
      if (request.functionName === "metadataCommitmentOf") return gameId;
      if (request.functionName === "isCharacterLocked") return true;
      throw new Error("unexpected read");
    },
  };

  assert.deepEqual(await readCharacter(reader as never, character, 1n), {
    owner: player,
    gameId,
    metadataCommitment: gameId,
  });
  assert.equal(await isCharacterLocked(reader as never, protocol, character, 1n), true);
  await createLicenseOffer(writer as never, protocol, {
    characterContract: character,
    tokenId: 1n,
    allowedLicensee: player,
    mode: 1,
    price: 100n,
    duration: 3_600n,
    deadline: 1_800_003_600n,
    termsHash: gameId,
    exclusive: true,
  });
  await createListing(writer as never, protocol, character, 1n, 200n, 1_800_003_600n);
  await buyListing(writer as never, protocol, 1n, 200n);

  assert.deepEqual(writes.map((request) => request.functionName), ["createOffer", "createListing", "buy"]);
  assert.equal(writes[2]?.value, 200n);
});
