import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson, stateCommitment } from "./canonical-state.ts";
import { calculatePoPL, policyId } from "./popl-policy.ts";
import { PublisherVerifier } from "./publisher-verifier.ts";
import {
  checkpointDigest,
  stateRegistryDomain,
  verifyAchievementSignature,
  verifyCheckpointSignature,
} from "./typed-data.ts";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const characterContract = "0x1000000000000000000000000000000000000001" as const;
const registry = "0x2000000000000000000000000000000000000002" as const;
const gameId = "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393" as const;
const domain = stateRegistryDomain(31_337, registry);

test("canonical state is stable across property ordering", () => {
  const left = { xp: 42, inventory: ["sword", "shield"], stats: { wins: 2, losses: 1 } };
  const right = { stats: { losses: 1, wins: 2 }, inventory: ["sword", "shield"], xp: 42 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(stateCommitment(left), stateCommitment(right));
});

test("reference PoPL policy requires both play and achievements", () => {
  assert.equal(calculatePoPL(18_000n, 0), 1);
  assert.equal(calculatePoPL(18_000n, 1), 2);
  assert.match(policyId(), /^0x[0-9a-f]{64}$/);
});

test("publisher verifier signs valid checkpoint and achievement payloads", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });
  const signedCheckpoint = await verifier.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { level: 4, xp: 9200, inventory: ["ember-blade"] },
    playTimeSeconds: 18_000n,
    achievementCount: 1,
  });
  assert.equal(signedCheckpoint.checkpoint.popl, 2);
  assert.equal(await verifyCheckpointSignature(domain, signedCheckpoint), true);
  assert.equal(checkpointDigest(domain, signedCheckpoint.checkpoint).length, 66);

  const signedAchievement = await verifier.issueAchievement({
    characterContract,
    tokenId: 1n,
    gameId,
    achievement: "FIRST_WIN",
    evidence: { matchId: "arena-42", result: "win" },
  });
  assert.equal(await verifyAchievementSignature(domain, signedAchievement), true);
});

test("tampering with a signed checkpoint is detected", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });
  const signed = await verifier.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { xp: 100 },
    playTimeSeconds: 3_600n,
    achievementCount: 0,
  });
  signed.checkpoint.playTimeSeconds = 360_000n;
  assert.equal(await verifyCheckpointSignature(domain, signed), false);
});

test("publisher verifier rejects skipped sequences and regressed play time", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });
  await verifier.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { xp: 100 },
    playTimeSeconds: 3_600n,
    achievementCount: 0,
  });

  await assert.rejects(
    verifier.issueCheckpoint({
      characterContract,
      tokenId: 1n,
      gameId,
      sequence: 3n,
      state: { xp: 200 },
      playTimeSeconds: 7_200n,
      achievementCount: 0,
    }),
    /sequence must be 2/,
  );
  await assert.rejects(
    verifier.issueCheckpoint({
      characterContract,
      tokenId: 1n,
      gameId,
      sequence: 2n,
      state: { xp: 50 },
      playTimeSeconds: 3_599n,
      achievementCount: 0,
    }),
    /play time cannot decrease/,
  );
});

test("publisher verifier rejects a future occurredAt", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });
  await assert.rejects(
    verifier.issueCheckpoint({
      characterContract,
      tokenId: 1n,
      gameId,
      sequence: 1n,
      state: { xp: 100 },
      playTimeSeconds: 3_600n,
      achievementCount: 0,
      occurredAt: 1_800_000_001n,
    }),
    /occurredAt cannot be in the future/,
  );
  await assert.rejects(
    verifier.issueAchievement({
      characterContract,
      tokenId: 1n,
      gameId,
      achievement: "FIRST_WIN",
      evidence: { matchId: "arena-42" },
      occurredAt: 1_800_000_001n,
    }),
    /occurredAt cannot be in the future/,
  );
});

test("publisher verifier rejects a non-monotonic occurredAt and does not advance state", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_500n });
  await verifier.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { xp: 100 },
    playTimeSeconds: 3_600n,
    achievementCount: 0,
    occurredAt: 1_800_000_100n,
  });
  await assert.rejects(
    verifier.issueCheckpoint({
      characterContract,
      tokenId: 1n,
      gameId,
      sequence: 2n,
      state: { xp: 200 },
      playTimeSeconds: 7_200n,
      achievementCount: 0,
      occurredAt: 1_800_000_099n,
    }),
    /occurredAt cannot decrease/,
  );
  // The rejected checkpoint must not have advanced the persisted sequence: sequence 2 with a
  // valid occurredAt still succeeds afterwards.
  const next = await verifier.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 2n,
    state: { xp: 200 },
    playTimeSeconds: 7_200n,
    achievementCount: 0,
    occurredAt: 1_800_000_200n,
  });
  assert.equal(next.checkpoint.sequence, 2n);
});

test("concurrent checkpoint issuance is serialized per character", async () => {
  const delayedAccount = {
    address: account.address,
    async signTypedData(parameters: Record<string, unknown>) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return account.signTypedData(parameters as never);
    },
  };
  const verifier = new PublisherVerifier({
    account: delayedAccount,
    domain,
    now: () => 1_800_000_000n,
  });
  const request = {
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { xp: 100 },
    playTimeSeconds: 3_600n,
    achievementCount: 0,
  } as const;

  const results = await Promise.allSettled([
    verifier.issueCheckpoint(request),
    verifier.issueCheckpoint(request),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /sequence must be 2/);
});
