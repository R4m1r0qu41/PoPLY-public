import {
  closeSync,
  fsyncSync,
  openSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { SequenceConflictError, type VerifierProgress, type VerifierStateStore } from "../../sdk/src/publisher-verifier.ts";

interface StoredFile {
  schemaVersion: 1;
  records: Record<
    string,
    { sequence: string; playTimeSeconds: string; popl: number; occurredAt?: string }
  >;
}

const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]*)$/;

export class FileVerifierStateStore implements VerifierStateStore {
  private records = new Map<string, VerifierProgress>();
  readonly path: string;
  private closed = false;
  private poisoned = false;

  constructor(path: string) {
    if (path.length === 0) throw new TypeError("state file path is required");
    this.path = path;
    this.acquireLock();
    try {
      if (existsSync(path)) this.load(readFileSync(path, "utf8"));
    } catch (error) {
      this.close();
      throw error;
    }
  }

  /// Releases the single-writer lock. Call when the store is no longer needed (tests, graceful
  /// shutdown); a crashed process's stale lock is reclaimed automatically by the next store.
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      rmSync(this.lockPath());
    } catch {
      // Already released or never acquired past construction; nothing to do.
    }
  }

  private lockPath(): string {
    return `${this.path}.lock`;
  }

  /// Single-writer guard: the whole-file load-once/rewrite-on-set design is only safe when
  /// exactly one process owns the file, so a second store on the same path must fail at
  /// construction instead of silently clobbering the first writer's monotonic state. The lock
  /// file records the owner pid; a lock whose pid is no longer alive is treated as stale and
  /// reclaimed, so a crash does not permanently wedge the path.
  private acquireLock(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = this.lockPath();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        writeFileSync(lock, `${process.pid}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const holder = Number.parseInt(readFileSync(lock, "utf8"), 10);
        if (Number.isSafeInteger(holder) && holder > 0 && isProcessAlive(holder)) {
          throw new Error(
            `verifier state file ${this.path} is locked by running process ${holder}; ` +
              "FileVerifierStateStore requires a single writer",
          );
        }
        rmSync(lock, { force: true });
      }
    }
    throw new Error(`could not acquire verifier state lock ${lock}`);
  }

  get(characterKey: string): VerifierProgress | undefined {
    if (this.closed || this.poisoned) throw new Error("state store is closed or requires restart");
    const progress = this.records.get(characterKey);
    return progress ? structuredClone(progress) : undefined;
  }

  set(characterKey: string, progress: VerifierProgress, expectedRevision?: number): void {
    if (this.closed || this.poisoned) throw new Error("state store is closed or requires restart");
    validateProgress(progress);
    if (expectedRevision !== undefined && (this.records.get(characterKey)?.revision ?? 0) !== expectedRevision) {
      throw new SequenceConflictError((this.records.get(characterKey)?.sequence ?? 0n) + 1n);
    }
    const next = new Map(this.records);
    next.set(characterKey, structuredClone(progress));
    this.flush(next);
    // Publish in memory only after the durable snapshot replacement succeeds.
    this.records = next;
  }

  private load(raw: string): void {
    const current = JSON.parse(raw) as { schemaVersion?: number; records?: Record<string, string> };
    if (current.schemaVersion === 2) {
      if (!current.records || Array.isArray(current.records) || typeof current.records !== "object") throw new TypeError("invalid state records");
      for (const [key, encoded] of Object.entries(current.records)) this.records.set(key, decodeProgress(encoded));
      return;
    }
    const parsed = current as unknown as Partial<StoredFile>;
    if (parsed.schemaVersion !== 1 || !parsed.records || typeof parsed.records !== "object") {
      throw new TypeError("unsupported verifier state file");
    }
    for (const [key, value] of Object.entries(parsed.records)) {
      // occurredAt is absent in schemaVersion:1 files written before it was tracked; treat a
      // missing value as 0n for backward compatibility, but validate it when present.
      const occurredAt = value?.occurredAt;
      if (
        !value ||
        typeof value.sequence !== "string" ||
        typeof value.playTimeSeconds !== "string" ||
        typeof value.popl !== "number" ||
        !UNSIGNED_DECIMAL.test(value.sequence) ||
        !UNSIGNED_DECIMAL.test(value.playTimeSeconds) ||
        (occurredAt !== undefined &&
          (typeof occurredAt !== "string" || !UNSIGNED_DECIMAL.test(occurredAt)))
      ) {
        throw new TypeError(`invalid verifier state record: ${key}`);
      }
      const progress = {
        sequence: BigInt(value.sequence),
        playTimeSeconds: BigInt(value.playTimeSeconds),
        popl: value.popl,
        occurredAt: occurredAt === undefined ? 0n : BigInt(occurredAt),
      };
      validateProgress(progress);
      this.records.set(key, progress);
    }
  }

  private flush(snapshot: Map<string, VerifierProgress>): void {
    const records = Object.fromEntries([...snapshot].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, progress]) => [key, encodeProgress(progress)]));
    const document = { schemaVersion: 2, records };
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flush: true });
    renameSync(temporary, this.path);
    // A failure after rename is ambiguous: never continue on stale in-memory state.
    try {
      const directory = openSync(dirname(this.path), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user — still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function validateProgress(progress: VerifierProgress): void {
  if (!progress || typeof progress.sequence !== "bigint" || typeof progress.playTimeSeconds !== "bigint" || typeof progress.occurredAt !== "bigint") throw new TypeError("invalid verifier progress");
  if (progress.revision !== undefined && (!Number.isSafeInteger(progress.revision) || progress.revision < 0)) throw new TypeError("invalid revision");
  if (progress.sequence < 0n || progress.playTimeSeconds < 0n || progress.occurredAt < 0n) {
    throw new RangeError("verifier progress cannot be negative");
  }
  if (!Number.isInteger(progress.popl) || progress.popl < 0 || progress.popl > 65_535) {
    throw new RangeError("verifier PoPL must fit uint16");
  }
}

// Shared durable representation for the single-writer file store and transactional SQLite store.
export function encodeProgress(progress: VerifierProgress): string {
  validateProgress(progress);
  return JSON.stringify(progress, (_key, value: unknown) => typeof value === "bigint" ? { $bigint: value.toString() } : value);
}

export function decodeProgress(raw: string): VerifierProgress {
  const progress: VerifierProgress = JSON.parse(raw, (_key, value: unknown) => {
    if (value && typeof value === "object" && "$bigint" in value) {
      const decimal = (value as { $bigint: unknown }).$bigint;
      if (typeof decimal !== "string" || !UNSIGNED_DECIMAL.test(decimal)) throw new TypeError("invalid stored integer");
      return BigInt(decimal);
    }
    return value;
  });
  validateProgress(progress);
  return progress;
}
