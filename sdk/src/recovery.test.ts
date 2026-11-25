import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { MemoryVerifierStateStore, PublisherVerifier } from "./publisher-verifier.ts";
import { stateRegistryDomain } from "./typed-data.ts";
import { canonicalJson } from "./canonical-state.ts";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const domain = stateRegistryDomain(31337, "0x2000000000000000000000000000000000000002");
const request = {
  characterContract: "0x1000000000000000000000000000000000000001", tokenId: 1n,
  gameId: `0x${"a".repeat(64)}`, sequence: 1n, state: { xp: 1 }, playTimeSeconds: 3600n,
  achievementCount: 0, idempotencyKey: "match-001",
} as const;

test("rejected delta, stale timestamp and schema never consume a sequence", async () => {
  const verifier = new PublisherVerifier({ account, domain, now: () => 2000n });
  await assert.rejects(verifier.issueCheckpoint({ ...request, playTimeSeconds: 86401n }), /delta/);
  await assert.rejects(verifier.issueCheckpoint({ ...request, occurredAt: 1n }), /expired/);
  await assert.rejects(verifier.issueAchievement({ ...request, achievement: "FIRST_WIN", evidence: {}, occurredAt: 1n }), /expired/);
  assert.equal((await verifier.issueCheckpoint(request)).checkpoint.sequence, 1n);
  const store = new MemoryVerifierStateStore();
  const invalid = new PublisherVerifier({ account, domain, stateStore: store, validateCheckpoint: () => { throw new Error("schema"); } });
  await assert.rejects(invalid.issueCheckpoint(request), /schema/);
  assert.equal(store.records.size, 0);
});

test("policy jump above the contract ceiling fails before signing", async () => {
  const verifier = new PublisherVerifier({ account, domain, policy: [{ level: 0, minimumPlayTimeSeconds: 0n, minimumAchievements: 0 }, { level: 33, minimumPlayTimeSeconds: 1n, minimumAchievements: 0 }] });
  await assert.rejects(verifier.issueCheckpoint(request), /PoPL delta/);
});

test("idempotent original response survives renewal and renewal never changes facts", async () => {
  let now = 2000n;
  const verifier = new PublisherVerifier({ account, domain, now: () => now });
  const original = await verifier.issueCheckpoint(request);
  assert.deepEqual(await verifier.issueCheckpoint(request), original);
  await assert.rejects(verifier.issueCheckpoint({ ...request, state: { xp: 2 } }), /sequence/);
  now = 3000n;
  const renewal = await verifier.renewCheckpoint(request, 1n);
  assert.deepEqual({ ...renewal.checkpoint, deadline: original.checkpoint.deadline }, original.checkpoint);
  assert.equal(renewal.checkpoint.deadline, 3900n);
  assert.deepEqual(await verifier.renewCheckpoint(request, 1n), renewal);
  assert.deepEqual(await verifier.issueCheckpoint(request), original);
  assert.deepEqual(verifier.recoverCheckpoint(request, 1n), original);
  assert.equal((await verifier.issueCheckpoint({ ...request, sequence: 2n, idempotencyKey: "next" })).checkpoint.sequence, 2n);
});

test("deployment/game reuse fails closed and returned response cannot mutate durable state", async () => {
  const store = new MemoryVerifierStateStore();
  const verifier = new PublisherVerifier({ account, domain, stateStore: store });
  const signed = await verifier.issueCheckpoint(request);
  signed.checkpoint.sequence = 99n;
  assert.equal(verifier.recoverCheckpoint(request, 1n).checkpoint.sequence, 1n);
  const other = new PublisherVerifier({ account, domain: { ...domain, chainId: 1 }, stateStore: store });
  await assert.rejects(other.issueCheckpoint(request), /domain\/game mismatch/);
  assert.throws(() => verifier.recoverCheckpoint({ ...request, gameId: `0x${"b".repeat(64)}` }, 1n), /domain\/game mismatch/);
});

test("canonical input rejects unsupported values, sparse arrays, depth and node exhaustion", () => {
  for (const value of [undefined, new Date(), [undefined], Array(2), () => 1, { x: 1.5 }]) assert.throws(() => canonicalJson(value));
  let deep: unknown = null;
  for (let i = 0; i < 34; i++) deep = { child: deep };
  assert.throws(() => canonicalJson(deep), /limits/);
  assert.throws(() => canonicalJson(Array(10001).fill(0)), /limits/);
});


test("slow signing cannot return expired envelopes or advance durable progress", async () => {
  let now = 2000n;
  const slowAccount = { address: account.address, signTypedData: async (parameters: Record<string, unknown>) => {
    const signature = await account.signTypedData(parameters as never);
    now += 1000n;
    return signature;
  } };
  const store = new MemoryVerifierStateStore();
  const verifier = new PublisherVerifier({ account: slowAccount, domain, stateStore: store, now: () => now });
  await assert.rejects(verifier.issueCheckpoint(request), /expired during signing/);
  assert.equal(store.records.size, 0);
  await assert.rejects(verifier.issueAchievement({ ...request, achievement: "FIRST_WIN", evidence: {} }), /expired during signing/);
  const fast = new PublisherVerifier({ account, domain, stateStore: store, now: () => now });
  const original = await fast.issueCheckpoint(request);
  now += 1000n;
  await assert.rejects(verifier.renewCheckpoint(request, 1n), /expired during signing/);
  assert.deepEqual(fast.recoverCheckpoint(request, 1n), original);
  assert.equal(store.get(`${request.characterContract}:1`)?.outbox?.[0]?.renewals.length, 0);
});
