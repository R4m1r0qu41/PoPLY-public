import { mkdirSync, openSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { SequenceConflictError, type VerifierProgress, type VerifierStateStore } from "../../sdk/src/publisher-verifier.ts";
import { decodeProgress, encodeProgress } from "./file-state-store.ts";

/** One local database shared by verifier processes; not a multi-host/HA database.
 * Progress and all issued responses are committed together with a revision comparison.
 * Signing happens outside the transaction. A losing signer never returns its signature. */
export class SqliteVerifierStateStore implements VerifierStateStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (!path || path === ":memory:") throw new TypeError("a durable SQLite path is required");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    closeSync(openSync(path, "a", 0o600));
    this.db = new DatabaseSync(path, { timeout: 1000 });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS verifier_progress (character_key TEXT PRIMARY KEY, body TEXT NOT NULL)");
  }

  get(key: string): VerifierProgress | undefined {
    const row = this.db.prepare("SELECT body FROM verifier_progress WHERE character_key = ?").get(key);
    return row ? decodeProgress(String(row.body)) : undefined;
  }

  set(key: string, progress: VerifierProgress, expectedRevision?: number): void {
    const body = encodeProgress(progress);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.get(key);
      if (expectedRevision !== undefined && (previous?.revision ?? 0) !== expectedRevision) {
        throw new SequenceConflictError((previous?.sequence ?? 0n) + 1n);
      }
      this.db.prepare("INSERT INTO verifier_progress(character_key, body) VALUES (?, ?) ON CONFLICT(character_key) DO UPDATE SET body = excluded.body").run(key, body);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** SQLite online backup includes WAL state. Copying the .sqlite file alone is unsafe. */
  async backupTo(path: string): Promise<void> {
    closeSync(openSync(path, "wx", 0o600));
    await backup(this.db, path);
  }

  close(): void { this.db.close(); }
}
