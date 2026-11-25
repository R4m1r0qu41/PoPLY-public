import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { PublisherVerifier } from "../../sdk/src/publisher-verifier.ts";
import { stateRegistryDomain } from "../../sdk/src/typed-data.ts";
import { FileVerifierStateStore } from "./file-state-store.ts";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const characterContract = "0x1000000000000000000000000000000000000001" as const;
const gameId = "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393" as const;
const domain = stateRegistryDomain(31_337, "0x2000000000000000000000000000000000000002");

test("file state store preserves verifier progress across restart", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "poply-state-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "state", "verifier.json");
  const firstStore = new FileVerifierStateStore(path);
  const first = new PublisherVerifier({
    account,
    domain,
    now: () => 1_800_000_000n,
    stateStore: firstStore,
  });
  await first.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 1n,
    state: { xp: 100 },
    playTimeSeconds: 3_600n,
    achievementCount: 0,
  });

  // Simulate a restart: the first process releases its single-writer lock before the next
  // store takes over the same path.
  firstStore.close();
  const restartedStore = new FileVerifierStateStore(path);
  const restarted = new PublisherVerifier({
    account,
    domain,
    now: () => 1_800_000_100n,
    stateStore: restartedStore,
  });
  await assert.rejects(
    restarted.issueCheckpoint({
      characterContract,
      tokenId: 1n,
      gameId,
      sequence: 1n,
      state: { xp: 101 },
      playTimeSeconds: 3_601n,
      achievementCount: 0,
    }),
    /sequence must be 2/,
  );
  const second = await restarted.issueCheckpoint({
    characterContract,
    tokenId: 1n,
    gameId,
    sequence: 2n,
    state: { xp: 200 },
    playTimeSeconds: 7_200n,
    achievementCount: 0,
  });
  assert.equal(second.checkpoint.sequence, 2n);
  restartedStore.close();
  const reloaded = new FileVerifierStateStore(path).get(`${characterContract}:1`);
  assert.equal(reloaded?.sequence, 2n);
  // occurredAt is persisted and restored (the checkpoint above was issued at now()).
  assert.equal(reloaded?.occurredAt, 1_800_000_100n);
});

test("file state store enforces a single writer per path", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "poply-state-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "state", "verifier.json");
  const holder = new FileVerifierStateStore(path);
  assert.throws(() => new FileVerifierStateStore(path), /locked by running process/);
  holder.close();
  // A released (or crashed-and-stale) lock is reclaimable.
  const successor = new FileVerifierStateStore(path);
  successor.close();
});

test("file state store defaults missing occurredAt to zero for schemaVersion:1 files", () => {
  const directory = mkdtempSync(join(tmpdir(), "poply-state-"));
  const path = join(directory, "state", "verifier.json");
  mkdirSync(join(directory, "state"), { recursive: true });
  // A legacy file written before occurredAt was tracked (no occurredAt field).
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      records: {
        [`${characterContract}:1`]: { sequence: "1", playTimeSeconds: "3600", popl: 1 },
      },
    })}\n`,
    "utf8",
  );

  const store = new FileVerifierStateStore(path);
  const progress = store.get(`${characterContract}:1`);
  assert.equal(progress?.sequence, 1n);
  assert.equal(progress?.occurredAt, 0n);
  rmSync(directory, { recursive: true, force: true });
});

test("file state store rejects a malformed occurredAt", () => {
  const directory = mkdtempSync(join(tmpdir(), "poply-state-"));
  const path = join(directory, "state", "verifier.json");
  mkdirSync(join(directory, "state"), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      records: {
        [`${characterContract}:1`]: {
          sequence: "1",
          playTimeSeconds: "3600",
          popl: 1,
          occurredAt: "-5",
        },
      },
    })}\n`,
    "utf8",
  );
  assert.throws(() => new FileVerifierStateStore(path), /invalid verifier state record/);
  rmSync(directory, { recursive: true, force: true });
});
