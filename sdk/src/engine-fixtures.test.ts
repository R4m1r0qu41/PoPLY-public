import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { PublisherVerifier } from "./publisher-verifier.ts";
import { stateRegistryDomain, verifyAchievementSignature, verifyCheckpointSignature } from "./typed-data.ts";
import type { CanonicalValue } from "./canonical-state.ts";
import type { Address, Hex } from "viem";

interface CheckpointFixture {
  characterContract: Address;
  tokenId: string;
  gameId: Hex;
  sequence: string;
  state: CanonicalValue;
  playTimeSeconds: string;
  achievementCount: number;
}

interface AchievementFixture {
  characterContract: Address;
  tokenId: string;
  gameId: Hex;
  achievement: string;
  evidence: CanonicalValue;
}

test("engine-neutral JSON fixtures produce valid signed envelopes", async () => {
  const checkpoint = await fixture<CheckpointFixture>("checkpoint-request.json");
  const achievement = await fixture<AchievementFixture>("achievement-request.json");
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  const domain = stateRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });

  const signedCheckpoint = await verifier.issueCheckpoint({
    ...checkpoint,
    tokenId: BigInt(checkpoint.tokenId),
    sequence: BigInt(checkpoint.sequence),
    playTimeSeconds: BigInt(checkpoint.playTimeSeconds),
  });
  const signedAchievement = await verifier.issueAchievement({
    ...achievement,
    tokenId: BigInt(achievement.tokenId),
  });

  assert.equal(await verifyCheckpointSignature(domain, signedCheckpoint), true);
  assert.equal(await verifyAchievementSignature(domain, signedAchievement), true);
});

async function fixture<T>(name: string): Promise<T> {
  const contents = await readFile(new URL(`../engines/fixtures/${name}`, import.meta.url), "utf8");
  return JSON.parse(contents) as T;
}
