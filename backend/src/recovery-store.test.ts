import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { PublisherVerifier } from "../../sdk/src/publisher-verifier.ts";
import { stateRegistryDomain } from "../../sdk/src/typed-data.ts";
import { FileVerifierStateStore } from "./file-state-store.ts";
import { SqliteVerifierStateStore } from "./sqlite-state-store.ts";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const domain = stateRegistryDomain(31337, "0x2000000000000000000000000000000000000002");
const request = {
  characterContract: "0x1000000000000000000000000000000000000001", tokenId: 1n,
  gameId: `0x${"a".repeat(64)}`, sequence: 1n, state: { xp: 1 }, playTimeSeconds: 3600n,
  achievementCount: 0, idempotencyKey: "match-001",
} as const;
const progress = { sequence: 1n, playTimeSeconds: 1n, popl: 0, occurredAt: 1n, revision: 1 };

for (const kind of ["file", "sqlite"] as const) {
  test(`${kind}: exact response and renewed attempts survive restart`, async (context) => {
    const directory = mkdtempSync(join(tmpdir(), "poply-recovery-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "state");
    const Store = kind === "file" ? FileVerifierStateStore : SqliteVerifierStateStore;
    const first = new Store(path);
    const verifier = new PublisherVerifier({ account, domain, stateStore: first, now: () => 2000n });
    const original = await verifier.issueCheckpoint(request);
    first.close();
    const next = new Store(path);
    const restarted = new PublisherVerifier({ account, domain, stateStore: next, now: () => 3000n });
    assert.deepEqual(await restarted.issueCheckpoint(request), original);
    const renewed = await restarted.renewCheckpoint(request, 1n);
    next.close();
    const third = new Store(path);
    const restored = new PublisherVerifier({ account, domain, stateStore: third, now: () => 3001n });
    assert.deepEqual(await restored.issueCheckpoint(request), original);
    assert.deepEqual(await restored.renewCheckpoint(request, 1n), renewed);
    third.close();
  });
}

test("file: failed temp write and rename preserve memory and disk, corrected retry succeeds", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "poply-failure-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json");
  const store = new FileVerifierStateStore(path);
  store.set("character", progress);
  const before = readFileSync(path, "utf8");
  mkdirSync(`${path}.tmp`);
  assert.throws(() => store.set("character", { ...progress, sequence: 2n }));
  assert.equal(store.get("character")?.sequence, 1n);
  assert.equal(readFileSync(path, "utf8"), before);
  rmSync(`${path}.tmp`, { recursive: true });
  renameSync(path, `${path}.saved`);
  mkdirSync(path);
  assert.throws(() => store.set("character", { ...progress, sequence: 2n }));
  assert.equal(store.get("character")?.sequence, 1n);
  rmSync(path, { recursive: true });
  renameSync(`${path}.saved`, path);
  store.set("character", { ...progress, sequence: 2n });
  store.close();
  const restarted = new FileVerifierStateStore(path);
  assert.equal(restarted.get("character")?.sequence, 2n);
  restarted.close();
});

test("sqlite: independent writers cannot publish conflicting sequence; online backup restores outbox", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "poply-sqlite-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "state.sqlite");
  const a = new SqliteVerifierStateStore(path), b = new SqliteVerifierStateStore(path);
  const va = new PublisherVerifier({ account, domain, stateStore: a });
  const vb = new PublisherVerifier({ account, domain, stateStore: b });
  const results = await Promise.allSettled([va.issueCheckpoint(request), vb.issueCheckpoint({ ...request, state: { xp: 2 } })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const recovered = va.recoverCheckpoint(request, 1n);
  const backup = join(directory, "backup.sqlite");
  await a.backupTo(backup);
  a.close(); b.close();
  const restored = new SqliteVerifierStateStore(backup);
  assert.deepEqual(new PublisherVerifier({ account, domain, stateStore: restored }).recoverCheckpoint(request, 1n), recovered);
  restored.close();
});
