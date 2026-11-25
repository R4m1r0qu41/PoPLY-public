import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { PublisherVerifier } from "../../../sdk/src/publisher-verifier.ts";
import { stateRegistryDomain, verifyAchievementSignature, verifyCheckpointSignature } from "../../../sdk/src/typed-data.ts";
import { createArenaState, startArena, stepArena } from "../game/simulation/arena.ts";
import { buildProofRequests } from "./match-proof.ts";

test("arena victory produces verifiable PoP and PoA envelopes", async () => {
  let state = startArena(createArenaState());
  for (let frame = 0; frame < 2_000 && state.phase === "running"; frame += 1) {
    state = stepArena(state, { left: false, right: true, attack: true }, 50);
  }
  assert.equal(state.phase, "victory");
  const bundle = buildProofRequests(state);
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const domain = stateRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");
  const verifier = new PublisherVerifier({ account, domain, now: () => 1_800_000_000n });
  const signedCheckpoint = await verifier.issueCheckpoint({ ...bundle.checkpoint, tokenId: BigInt(bundle.checkpoint.tokenId), sequence: BigInt(bundle.checkpoint.sequence), playTimeSeconds: BigInt(bundle.checkpoint.playTimeSeconds) });
  const signedAchievement = await verifier.issueAchievement({ ...bundle.achievement, tokenId: BigInt(bundle.achievement.tokenId) });
  assert.equal(await verifyCheckpointSignature(domain, signedCheckpoint), true);
  assert.equal(await verifyAchievementSignature(domain, signedAchievement), true);
});
