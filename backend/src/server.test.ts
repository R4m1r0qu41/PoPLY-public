import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { privateKeyToAccount } from "viem/accounts";
import { stateRegistryDomain } from "../../sdk/src/typed-data.ts";
import { createApiServer } from "./server.ts";

const API_KEY = "test-api-key-is-long-enough";
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const characterContract = "0x1000000000000000000000000000000000000001";
const registry = "0x2000000000000000000000000000000000000002";
const gameId = "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393";

test("publisher API authenticates and issues signed protocol payloads", async (context) => {
  const server = createApiServer({
    account,
    domain: stateRegistryDomain(31_337, registry),
    apiKey: API_KEY,
    gameIds: [gameId],
    now: () => 1_800_000_000n,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as { status: string }).status, "ok");

  const unauthorized = await fetch(`${base}/v1/checkpoints`, { method: "POST", body: "{}" });
  assert.equal(unauthorized.status, 401);

  const checkpoint = await fetch(`${base}/v1/checkpoints`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      characterContract,
      tokenId: "1",
      gameId,
      sequence: "1",
      state: { level: 2, wins: 1 },
      playTimeSeconds: "18000",
      achievementCount: 1,
    }),
  });
  assert.equal(checkpoint.status, 201);
  const checkpointBody = await checkpoint.json() as Record<string, unknown>;
  assert.match(checkpointBody.signature as string, /^0x[0-9a-f]{130}$/);
  assert.equal((checkpointBody.checkpoint as { popl: number }).popl, 2);

  const achievement = await fetch(`${base}/v1/achievements`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      characterContract,
      tokenId: "1",
      gameId,
      achievement: "FIRST_WIN",
      evidence: { matchId: "arena-42", result: "win" },
    }),
  });
  assert.equal(achievement.status, 201);
  const achievementBody = await achievement.json() as Record<string, unknown>;
  assert.match(achievementBody.signature as string, /^0x[0-9a-f]{130}$/);

  // Replaying the already-consumed sequence is a state conflict, not a bad request, and the
  // body must not disclose the next expected sequence number.
  const conflict = await fetch(`${base}/v1/checkpoints`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      characterContract,
      tokenId: "1",
      gameId,
      sequence: "1",
      state: { level: 2, wins: 1 },
      playTimeSeconds: "18000",
      achievementCount: 1,
    }),
  });
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json() as { error: string; message: string };
  assert.equal(conflictBody.error, "sequence_conflict");
  assert.doesNotMatch(JSON.stringify(conflictBody), /\b2\b/);

  // Malformed input stays a 400 with an actionable reason.
  const malformed = await fetch(`${base}/v1/checkpoints`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ characterContract: "not-an-address" }),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json() as { error: string }).error, "invalid_request");
});

test("HTTP recovery enforces game scope, idempotency, validation and shared rotation quota", async (context) => {
  let now = 2000n;
  const rotated = "rotated-api-key-long-enough";
  const server = createApiServer({ account, domain: stateRegistryDomain(31337, registry), apiKey: API_KEY,
    additionalApiKeys: [rotated], gameIds: [gameId], requestsPerMinute: 10, now: () => now });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = { characterContract, tokenId: "1", gameId, sequence: "1", state: {}, playTimeSeconds: "1", achievementCount: 0, idempotencyKey: "request-1" };
  const post = (path: string, data: unknown, key = API_KEY) => fetch(base + path, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(data) });
  const first = await post("/v1/checkpoints", body);
  assert.equal(first.status, 201);
  assert.ok(first.headers.get("x-request-id"));
  const original = await first.json();
  assert.deepEqual(await (await post("/v1/checkpoints", body, rotated)).json(), original);
  assert.equal((await post("/v1/checkpoints", { ...body, state: { changed: true } })).status, 409);
  assert.equal((await post("/v1/checkpoints/recover", { ...body, gameId: `0x${"b".repeat(64)}` })).status, 403);
  assert.deepEqual(await (await post("/v1/checkpoints/recover", body)).json(), original);
  now = 3000n;
  const renewed = await post("/v1/checkpoints/renew", body);
  assert.equal(renewed.status, 200);
  assert.equal((await renewed.json() as { checkpoint: { deadline: string } }).checkpoint.deadline, "3900");
  assert.equal((await post("/v1/checkpoints", { ...body, sequence: "2", idempotencyKey: "request-2", state: 0.1 })).status, 400);
  assert.equal((await post("/v1/checkpoints", { ...body, sequence: "2", idempotencyKey: "request-2" })).status, 201);
  await post("/v1/checkpoints/recover", body);
  await post("/v1/checkpoints/recover", body);
  assert.equal((await post("/v1/checkpoints/recover", body, rotated)).status, 429);
});
