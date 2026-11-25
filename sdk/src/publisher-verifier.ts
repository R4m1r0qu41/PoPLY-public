import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { stateCommitment, type CanonicalValue } from "./canonical-state.ts";
import { calculatePoPL, policyId, referencePolicy, type PoPLThreshold } from "./popl-policy.ts";
import { checkpointDigest, signAchievement, signCheckpoint } from "./typed-data.ts";
import type {
  Achievement,
  Checkpoint,
  SignedAchievement,
  SignedCheckpoint,
  StateRegistryDomain,
  TypedDataAccount,
} from "./types.ts";

export interface CharacterReference {
  characterContract: Address;
  tokenId: bigint;
  gameId: Hex;
}

export interface CheckpointRequest extends CharacterReference {
  sequence: bigint;
  idempotencyKey?: string;
  state: CanonicalValue;
  playTimeSeconds: bigint;
  achievementCount: number;
  occurredAt?: bigint;
}

export interface AchievementRequest extends CharacterReference {
  achievement: string;
  evidence: CanonicalValue;
  occurredAt?: bigint;
}

export interface PublisherVerifierOptions {
  account: TypedDataAccount;
  domain: StateRegistryDomain;
  policy?: readonly PoPLThreshold[];
  signatureLifetimeSeconds?: bigint;
  now?: () => bigint;
  stateStore?: VerifierStateStore;
  validateCheckpoint?: (checkpoint: Checkpoint) => void;
  validateAchievement?: (achievement: Achievement) => void;
}

export interface CheckpointOutboxEntry {
  requestHash: Hex;
  idempotencyKey?: string;
  signed: SignedCheckpoint;
  digest: Hex;
  renewals: { signed: SignedCheckpoint; digest: Hex }[];
}

export interface VerifierProgress {
  context?: string;
  revision?: number;
  /** Issued statements, not an assertion of on-chain confirmation. */
  outbox?: CheckpointOutboxEntry[];
  sequence: bigint;
  playTimeSeconds: bigint;
  popl: number;
  occurredAt: bigint;
}

export interface VerifierStateStore {
  get(characterKey: string): VerifierProgress | undefined;
  set(characterKey: string, progress: VerifierProgress, expectedRevision?: number): void;
}

export class MemoryVerifierStateStore implements VerifierStateStore {
  readonly records = new Map<string, VerifierProgress>();

  get(characterKey: string): VerifierProgress | undefined {
    const progress = this.records.get(characterKey);
    return progress ? structuredClone(progress) : undefined;
  }

  set(characterKey: string, progress: VerifierProgress, expectedRevision?: number): void {
    if (expectedRevision !== undefined && (this.records.get(characterKey)?.revision ?? 0) !== expectedRevision) {
      throw new SequenceConflictError((this.records.get(characterKey)?.sequence ?? 0n) + 1n);
    }
    this.records.set(characterKey, structuredClone(progress));
  }
}

/// Thrown when a checkpoint request's sequence does not match the verifier's persisted
/// progression. Distinguished as its own type so transports can map it to a conflict status
/// (HTTP 409) without string-matching the message or leaking the expected sequence to callers.
export class SequenceConflictError extends RangeError {
  constructor(expected: bigint) {
    super(`checkpoint sequence must be ${expected}`);
    this.name = "SequenceConflictError";
  }
}

export class PublisherVerifier {
  readonly account: TypedDataAccount;
  readonly domain: StateRegistryDomain;
  readonly policy: readonly PoPLThreshold[];
  readonly signatureLifetimeSeconds: bigint;
  readonly now: () => bigint;
  readonly stateStore: VerifierStateStore;
  private readonly validateCheckpoint: ((checkpoint: Checkpoint) => void) | undefined;
  private readonly validateAchievement: ((achievement: Achievement) => void) | undefined;
  private readonly issuanceChains = new Map<string, Promise<void>>();

  constructor(options: PublisherVerifierOptions) {
    this.validateCheckpoint = options.validateCheckpoint;
    this.validateAchievement = options.validateAchievement;
    this.account = options.account;
    this.domain = options.domain;
    this.policy = options.policy ?? referencePolicy;
    this.signatureLifetimeSeconds = options.signatureLifetimeSeconds ?? 900n;
    this.now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1_000)));
    this.stateStore = options.stateStore ?? new MemoryVerifierStateStore();
    if (this.signatureLifetimeSeconds <= 0n) {
      throw new RangeError("signature lifetime must be positive");
    }
    policyId(this.policy);
  }

  async issueCheckpoint(request: CheckpointRequest): Promise<SignedCheckpoint> {
    const key = characterKey(request);
    return this.withCharacterLock(key, async () => {
      const previous = this.stateStore.get(key) ?? {
        sequence: 0n,
        playTimeSeconds: 0n,
        popl: 0,
        occurredAt: 0n,
      };

      this.assertContext(previous.sequence === 0n ? undefined : previous, request);
      const requestHash = stateCommitment({
        characterContract: request.characterContract.toLowerCase(), tokenId: request.tokenId,
        gameId: request.gameId.toLowerCase(), sequence: request.sequence, state: request.state,
        playTimeSeconds: request.playTimeSeconds, achievementCount: request.achievementCount,
        occurredAt: request.occurredAt ?? null,
      });
      if (request.idempotencyKey !== undefined) {
        if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(request.idempotencyKey)) throw new TypeError("invalid idempotency key");
        const existing = previous.outbox?.find((entry) => entry.idempotencyKey === request.idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) throw new SequenceConflictError(previous.sequence + 1n);
          return structuredClone(existing.signed);
        }
      }
      if (request.sequence !== previous.sequence + 1n) {
        throw new SequenceConflictError(previous.sequence + 1n);
      }
      if (request.playTimeSeconds < previous.playTimeSeconds) {
        throw new RangeError("play time cannot decrease");
      }

      // Mirror Solidity's checked addition as well as its delta, including upper-bound exhaustion.
      if (previous.playTimeSeconds > (1n << 64n) - 1n - 86_400n || previous.popl > 65_535 - 32) {
        throw new RangeError("on-chain checkpoint bounds exhausted");
      }
      if (request.playTimeSeconds - previous.playTimeSeconds > 86_400n) throw new RangeError("play time delta exceeds 86400 seconds");

      const popl = calculatePoPL(request.playTimeSeconds, request.achievementCount, this.policy);
      if (popl - previous.popl > 32) throw new RangeError("PoPL delta exceeds 32");
      if (popl < previous.popl) throw new RangeError("PoPL cannot decrease");

      // Validate occurredAt against the same rules the on-chain StateRegistry enforces BEFORE
      // signing or advancing persisted state: a checkpoint the contract would reject (future
      // timestamp, or a decrease below the stored occurredAt) must not optimistically bump the
      // sequence, or the character desyncs permanently.
      const now = this.now();
      const occurredAt = request.occurredAt ?? now;
      if (occurredAt > now) {
        throw new RangeError("occurredAt cannot be in the future");
      }
      if (occurredAt < previous.occurredAt) {
        throw new RangeError("occurredAt cannot decrease");
      }
      if (occurredAt + this.signatureLifetimeSeconds <= now) throw new RangeError("signature window has expired");
      const checkpoint: Checkpoint = {
        characterContract: request.characterContract,
        tokenId: request.tokenId,
        gameId: request.gameId,
        sequence: request.sequence,
        stateHash: stateCommitment(request.state),
        playTimeSeconds: request.playTimeSeconds,
        popl,
        policyId: policyId(this.policy),
        occurredAt,
        deadline: occurredAt + this.signatureLifetimeSeconds,
      };

      this.validateCheckpoint?.(checkpoint);
      const signed = await signCheckpoint(this.account, this.domain, checkpoint);
      if (checkpoint.deadline <= this.now()) throw new RangeError("signature window expired during signing");
      this.stateStore.set(key, {
        context: this.context(request),
        revision: (previous.revision ?? 0) + 1,
        outbox: [...(previous.outbox ?? []), {
          requestHash, ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
          signed, digest: checkpointDigest(this.domain, checkpoint), renewals: [],
        }],
        sequence: request.sequence,
        playTimeSeconds: request.playTimeSeconds,
        popl,
        occurredAt,
      }, previous.revision ?? 0);
      return structuredClone(signed);
    });
  }

  async issueAchievement(request: AchievementRequest): Promise<SignedAchievement> {
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(request.achievement)) {
      throw new TypeError("achievement name must be an uppercase stable identifier");
    }
    const now = this.now();
    const occurredAt = request.occurredAt ?? now;
    if (occurredAt > now) {
      throw new RangeError("occurredAt cannot be in the future");
    }
    if (occurredAt + this.signatureLifetimeSeconds <= now) throw new RangeError("signature window has expired");
    const achievement: Achievement = {
      characterContract: request.characterContract,
      tokenId: request.tokenId,
      gameId: request.gameId,
      achievementId: keccak256(stringToHex(request.achievement)),
      evidenceHash: stateCommitment(request.evidence),
      occurredAt,
      deadline: occurredAt + this.signatureLifetimeSeconds,
    };
    this.validateAchievement?.(achievement);
    const signed = await signAchievement(this.account, this.domain, achievement);
    if (achievement.deadline <= this.now()) throw new RangeError("signature window expired during signing");
    return signed;
  }

  /** Recover an exact durable response after a lost HTTP response. No sequence is rewound. */
  recoverCheckpoint(reference: CharacterReference, sequence: bigint): SignedCheckpoint {
    const progress = this.stateStore.get(characterKey(reference));
    this.assertContext(progress, reference);
    const entry = progress?.outbox?.find((entry) => entry.signed.checkpoint.sequence === sequence);
    if (!entry) throw new RangeError("checkpoint is not in the durable outbox");
    return structuredClone(entry.signed);
  }

  /** Renew only the deadline of a persisted statement. Old signatures remain possible;
   * all variants describe identical state at the same sequence, so either may execute safely.
   * This does not assert inclusion/finality and never frees a sequence for different state. */
  async renewCheckpoint(reference: CharacterReference, sequence: bigint): Promise<SignedCheckpoint> {
    const key = characterKey(reference);
    return this.withCharacterLock(key, async () => {
      const previous = this.stateStore.get(key);
      this.assertContext(previous, reference);
      const entry = previous?.outbox?.find((entry) => entry.signed.checkpoint.sequence === sequence);
      if (!previous || !entry) throw new RangeError("checkpoint is not in the durable outbox");
      const now = this.now();
      const latest = entry.renewals.at(-1)?.signed ?? entry.signed;
      if (now <= latest.checkpoint.deadline) return structuredClone(latest);
      const checkpoint = { ...entry.signed.checkpoint, deadline: now + this.signatureLifetimeSeconds };
      this.validateCheckpoint?.(checkpoint);
      const signed = await signCheckpoint(this.account, this.domain, checkpoint);
      if (checkpoint.deadline <= this.now()) throw new RangeError("signature window expired during signing");
      entry.renewals.push({ signed, digest: checkpointDigest(this.domain, checkpoint) });
      previous.revision = (previous.revision ?? 0) + 1;
      this.stateStore.set(key, previous, previous.revision - 1);
      return structuredClone(signed);
    });
  }

  private context(reference: CharacterReference): string {
    return `${this.domain.chainId}:${this.domain.verifyingContract.toLowerCase()}:${this.domain.name}:${this.domain.version}:${reference.gameId.toLowerCase()}`;
  }

  private assertContext(progress: VerifierProgress | undefined, reference: CharacterReference): void {
    if (progress && progress.sequence > 0n && progress.context !== this.context(reference)) {
      throw new Error("verifier state domain/game mismatch or legacy state requires explicit migration");
    }
  }

  private async withCharacterLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.issuanceChains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.issuanceChains.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.issuanceChains.get(key) === current) this.issuanceChains.delete(key);
    }
  }
}

export function characterKey(reference: CharacterReference): string {
  return `${reference.characterContract.toLowerCase()}:${reference.tokenId}`;
}
