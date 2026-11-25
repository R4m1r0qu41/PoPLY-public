import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PublisherVerifier,
  SequenceConflictError,
  type PublisherVerifierOptions,
} from "../../sdk/src/publisher-verifier.ts";
import { validateAchievement, validateCheckpoint } from "./schema-validation.ts";
import { stateRegistryDomain } from "../../sdk/src/typed-data.ts";
import { asCanonicalValue } from "../../sdk/src/canonical-state.ts";
import { SqliteVerifierStateStore } from "./sqlite-state-store.ts";
import { FileVerifierStateStore } from "./file-state-store.ts";

const MAX_BODY_BYTES = 256 * 1024;

export interface ApiConfig extends PublisherVerifierOptions {
  apiKey: string;
  gameIds: readonly Hex[];
  requestsPerMinute?: number;
  /** Accept old and new keys during a controlled rotation window. */
  additionalApiKeys?: readonly string[];
}

export function createApiServer(config: ApiConfig): Server {
  if (config.apiKey.length < 16) throw new TypeError("apiKey must contain at least 16 characters");
  const keys = [config.apiKey, ...(config.additionalApiKeys ?? [])];
  if (keys.some((key) => key.length < 16)) throw new TypeError("all API keys must contain at least 16 characters");
  if (!config.gameIds.length) throw new TypeError("at least one allowed game is required");
  const allowedGames = new Set(config.gameIds.map((game) => asBytes32(game, "gameIds").toLowerCase()));
  const quota = config.requestsPerMinute ?? 600;
  if (!Number.isSafeInteger(quota) || quota < 1) throw new RangeError("invalid request quota");
  let windowStart = Date.now(), used = 0;
  const verifier = new PublisherVerifier({ ...config, validateCheckpoint, validateAchievement });

  return createServer(async (request, response) => {
    response.setHeader("x-request-id", randomUUID());
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");

    try {
      const url = new URL(request.url ?? "/", "http://poply.local");
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, {
          status: "ok",
          service: "poply-publisher-verifier",
          signer: config.account.address,
        });
      }

      if (!keys.map((key) => authorized(request, key)).some(Boolean)) {
        return send(response, 401, { error: "unauthorized" });
      }

      if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); used = 0; }
      if (++used > quota) {
        response.setHeader("retry-after", "60");
        return send(response, 429, { error: "rate_limited" });
      }
      const readGameBody = async (): Promise<Record<string, unknown>> => {
        const body = asObject(await readJson(request));
        if (!allowedGames.has(asBytes32(body.gameId, "gameId").toLowerCase())) throw new GameScopeError();
        return body;
      };

      if (request.method === "POST" && url.pathname === "/v1/checkpoints") {
        const body = await readGameBody();
        const signed = await verifier.issueCheckpoint({
          characterContract: asAddress(body.characterContract, "characterContract"),
          tokenId: asBigInt(body.tokenId, "tokenId"),
          gameId: asBytes32(body.gameId, "gameId"),
          sequence: asBigInt(body.sequence, "sequence"),
          state: asCanonicalValue(body.state),
          ...(body.idempotencyKey === undefined ? {} : { idempotencyKey: asString(body.idempotencyKey, "idempotencyKey") }),
          playTimeSeconds: asBigInt(body.playTimeSeconds, "playTimeSeconds"),
          achievementCount: asInteger(body.achievementCount, "achievementCount"),
        });
        return send(response, 201, signed);
      }

      if (request.method === "POST" && (url.pathname === "/v1/checkpoints/recover" || url.pathname === "/v1/checkpoints/renew")) {
        const body = await readGameBody();
        const reference = { characterContract: asAddress(body.characterContract, "characterContract"), tokenId: asBigInt(body.tokenId, "tokenId"), gameId: asBytes32(body.gameId, "gameId") };
        const sequence = asBigInt(body.sequence, "sequence");
        const signed = url.pathname.endsWith("/renew")
          ? await verifier.renewCheckpoint(reference, sequence)
          : verifier.recoverCheckpoint(reference, sequence);
        return send(response, 200, signed);
      }

      if (request.method === "POST" && url.pathname === "/v1/achievements") {
        const body = await readGameBody();
        const signed = await verifier.issueAchievement({
          characterContract: asAddress(body.characterContract, "characterContract"),
          tokenId: asBigInt(body.tokenId, "tokenId"),
          gameId: asBytes32(body.gameId, "gameId"),
          achievement: asString(body.achievement, "achievement"),
          evidence: asCanonicalValue(body.evidence),
        });
        return send(response, 201, signed);
      }

      return send(response, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof GameScopeError) return send(response, 403, { error: "game_not_allowed" });
      // A stale sequence is a state conflict (409), not a malformed request; its body is
      // deliberately generic so the next expected sequence number never leaks to a caller that
      // does not already hold it. Validation failures (TypeError/RangeError raised by the input
      // guards or the verifier) are 400 with the actionable reason; anything else is an internal
      // fault and returns 500 with no detail.
      if (error instanceof SequenceConflictError) {
        return send(response, 409, { error: "sequence_conflict", message: "checkpoint sequence conflict" });
      }
      if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError) {
        return send(response, 400, { error: "invalid_request", message: error.message });
      }
      return send(response, 500, { error: "internal_error" });
    }
  });
}

class GameScopeError extends Error {}

function authorized(request: IncomingMessage, apiKey: string): boolean {
  const header = request.headers.authorization;
  if (typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${apiKey}`, "utf8");
  const provided = Buffer.from(header, "utf8");
  // timingSafeEqual throws on unequal lengths; guard first so the length check itself is the
  // only early-out (an attacker already learns length from any comparison), and compare the
  // equal-length case in constant time.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("request body exceeds 256 KiB");
    chunks.push(buffer);
  }
  if (size === 0) throw new TypeError("request body is required");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.end(
    JSON.stringify(body, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString(10) : value,
    ),
  );
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("request body must be an object");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${field} is required`);
  return value;
}

function asInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

// dedup: asBigInt/asAddress/asBytes32 overlap with assertUint/assertAddress/assertBytes32 in
// sdk/src/typed-data.ts, but the shapes don't line up cleanly to share: those SDK helpers are
// private, validate already-typed values (bigint/Address/Hex) and return void, whereas these
// parse untrusted `unknown` JSON and narrow the return type. Merging would force a lossy
// abstraction, so the checks are kept intentionally duplicated here.
function asBigInt(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${field} must be an unsigned base-10 string`);
  }
  return BigInt(value);
}

function asAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) {
    throw new TypeError(`${field} must be an EVM address`);
  }
  return value;
}

function asBytes32(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !isHex(value, { strict: true }) || value.length !== 66) {
    throw new TypeError(`${field} must be bytes32`);
  }
  return value;
}

function configFromEnvironment(): { host: string; port: number; config: ApiConfig } {
  const privateKey = process.env.POPLY_VERIFIER_PRIVATE_KEY;
  const registry = process.env.POPLY_STATE_REGISTRY;
  const apiKey = process.env.POPLY_PUBLISHER_API_KEY;
  // The signing chain id must match the deployed StateRegistry's block.chainid, or every
  // submitted checkpoint reverts with UnauthorizedVerifier. Require it explicitly rather than
  // defaulting: a silent fallback (e.g. Anvil's 31337) would ship wrong-chain signatures.
  // Set POPLY_CHAIN_ID=31337 for a local Anvil node.
  const chainId = Number(process.env.POPLY_CHAIN_ID);
  const port = Number(process.env.POPLY_PORT ?? "8787");
  const host = process.env.POPLY_HOST ?? "127.0.0.1";
  const stateFile = process.env.POPLY_STATE_FILE ?? ".poply/verifier-state.json";

  if (!privateKey || !isHex(privateKey, { strict: true }) || privateKey.length !== 66) {
    throw new TypeError("POPLY_VERIFIER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  if (!registry || !isAddress(registry, { strict: true })) {
    throw new TypeError("POPLY_STATE_REGISTRY must be an EVM address");
  }
  if (!apiKey) throw new TypeError("POPLY_PUBLISHER_API_KEY is required");
  if (!process.env.POPLY_CHAIN_ID) {
    throw new TypeError("POPLY_CHAIN_ID is required (use 31337 for a local Anvil node)");
  }
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new RangeError("POPLY_CHAIN_ID must be a positive chain id");
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("POPLY_PORT is invalid");
  }

  const account = privateKeyToAccount(privateKey);
  return {
    host,
    port,
    config: {
      account,
      domain: stateRegistryDomain(chainId, registry),
      apiKey,
      gameIds: (process.env.POPLY_GAME_IDS ?? "").split(",").filter(Boolean).map((value) => asBytes32(value.trim(), "POPLY_GAME_IDS")),
      stateStore: process.env.POPLY_STATE_DB
        ? new SqliteVerifierStateStore(process.env.POPLY_STATE_DB)
        : new FileVerifierStateStore(stateFile),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { host, port, config } = configFromEnvironment();
  createApiServer(config).listen(port, host, () => {
    process.stdout.write(`PoPLY publisher verifier listening on http://${host}:${port}\n`);
  });
}
