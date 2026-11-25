import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import {
  assignGame,
  gameIdFromSlug,
  publicOfferAllowed,
  publisherIdFromSlug,
  registerPublisher,
} from "./publisher-registry.ts";

const registry = "0x2000000000000000000000000000000000000002" as const;

test("slug ids are deterministic and match keccak256(bytes(slug))", () => {
  assert.equal(publisherIdFromSlug("roblox"), keccak256(stringToHex("roblox")));
  assert.equal(gameIdFromSlug("roblox.natural-disaster-survival"), keccak256(stringToHex("roblox.natural-disaster-survival")));
  // Distinct slugs never collide; the same slug always reproduces the same id.
  assert.notEqual(publisherIdFromSlug("epic-games"), publisherIdFromSlug("ubisoft"));
  assert.equal(publisherIdFromSlug("epic-games"), publisherIdFromSlug("epic-games"));
});

test("registry client encodes registerPublisher and assignGame calls", async () => {
  const writes: Array<{ functionName: string; args: readonly unknown[] }> = [];
  const writer = {
    writeContract(request: { functionName: string; args: readonly unknown[] }) {
      writes.push({ functionName: request.functionName, args: request.args });
      return Promise.resolve("0xhash");
    },
  };
  const publisherId = publisherIdFromSlug("roblox");
  const gameId = gameIdFromSlug("roblox.natural-disaster-survival");

  await registerPublisher(writer as never, registry, { publisherId, openLicensing: true, minPublicOfferPrice: 0n });
  await assignGame(writer as never, registry, gameId, publisherId);

  assert.deepEqual(writes.map((w) => w.functionName), ["registerPublisher", "assignGame"]);
  assert.deepEqual(writes[0]?.args, [publisherId, true, 0n]);
  assert.deepEqual(writes[1]?.args, [gameId, publisherId]);
});

test("publicOfferAllowed read is routed to the registry", async () => {
  const reader = {
    readContract(request: { functionName: string; args: readonly unknown[] }) {
      assert.equal(request.functionName, "publicOfferAllowed");
      return Promise.resolve(true);
    },
  };
  assert.equal(
    await publicOfferAllowed(reader as never, registry, gameIdFromSlug("roblox.x"), 1n),
    true,
  );
});
