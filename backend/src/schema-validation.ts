import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { Achievement, Checkpoint } from "../../sdk/src/types.ts";

// Wires the versioned JSON Schemas in schemas/ into the signing endpoints: every signed envelope
// is validated against its published schema before it leaves the verifier, so a drift between
// the SDK's output shape and the schema the ecosystem consumes fails loudly at issuance instead
// of surfacing downstream. Validation failures here are internal faults (the request inputs were
// already validated), so the caller sees a 500, never a signed-but-off-schema payload.

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas");
const ajv = new Ajv2020({ allErrors: false, strict: true });

function compile(file: string): ValidateFunction {
  return ajv.compile(JSON.parse(readFileSync(join(schemasDir, file), "utf8")) as object);
}

const checkpointSchema = compile("checkpoint.schema.json");
const achievementSchema = compile("achievement.schema.json");

class SchemaValidationError extends Error {
  constructor(schema: string, detail: string) {
    super(`signed ${schema} failed schema validation: ${detail}`);
    this.name = "SchemaValidationError";
  }
}

function assertValid(validator: ValidateFunction, schema: string, payload: unknown): void {
  if (validator(payload)) return;
  const first = validator.errors?.[0];
  const detail = first ? `${first.instancePath || "/"} ${first.message ?? ""}`.trim() : "unknown";
  throw new SchemaValidationError(schema, detail);
}

// The schemas encode uint values as base-10 strings; mirror the wire serialization in send().
function wireCheckpoint(checkpoint: Checkpoint): Record<string, unknown> {
  return {
    characterContract: checkpoint.characterContract,
    tokenId: checkpoint.tokenId.toString(10),
    gameId: checkpoint.gameId,
    sequence: checkpoint.sequence.toString(10),
    stateHash: checkpoint.stateHash,
    playTimeSeconds: checkpoint.playTimeSeconds.toString(10),
    popl: checkpoint.popl,
    policyId: checkpoint.policyId,
    occurredAt: checkpoint.occurredAt.toString(10),
    deadline: checkpoint.deadline.toString(10),
  };
}

function wireAchievement(achievement: Achievement): Record<string, unknown> {
  return {
    characterContract: achievement.characterContract,
    tokenId: achievement.tokenId.toString(10),
    gameId: achievement.gameId,
    achievementId: achievement.achievementId,
    evidenceHash: achievement.evidenceHash,
    occurredAt: achievement.occurredAt.toString(10),
    deadline: achievement.deadline.toString(10),
  };
}

export function validateCheckpoint(checkpoint: Checkpoint): void {
  assertValid(checkpointSchema, "checkpoint", wireCheckpoint(checkpoint));
}

export function validateAchievement(achievement: Achievement): void {
  assertValid(achievementSchema, "achievement", wireAchievement(achievement));
}
