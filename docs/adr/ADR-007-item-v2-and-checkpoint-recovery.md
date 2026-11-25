# ADR-007: Item v2, equipment exclusivity and checkpoint recovery

- Status: Accepted for the local reference implementation
- Date: 2026-10-08
- Sources: October code review R1–R5 and operator request to apply the fixes

## Decisions

Item Registry domain version becomes `2`. Issuance includes `metadataHash =
keccak256(bytes(uri))`, committing the exact UTF-8 URI, not the served bytes.
Transformations include `uint64 sequence` and `previousItemClassId`; both must
match current item state. Sequence advances atomically with transformation
and is scoped by collection/token ID, surviving owner transfer. Destruction
remains terminal. No gameplay or checkpoint ceiling is relaxed.

An active exclusive character license blocks owner unbinding of releasable
items. Non-exclusive and expired licenses allow it. This adopts the live
bound-equipment interpretation needed to repair R4's advertised guarantee,
not a snapshot guarantee: binding additions and verifier transformations are
not frozen, and game/legal terms must specify those permissions. Character
sales still sever bindings lazily rather than transferring a bundle.

Checkpoint issuance mirrors chain delta bounds and refuses expired envelopes
before and after async signing. Validation happens before progress is committed.
Issued responses, digests, original request hashes and renewal attempts persist
with progress. An exact keyed retry returns the original envelope. Renewal
changes only deadline; no issued sequence is ever reclaimed for different
facts. Old signatures may still execute, but describe the same statement.

File snapshots publish in memory only after durable replacement; an ambiguous
post-rename sync failure poisons the live store until restart. SQLite commits
progress/outbox together and compares the expected revision in an immediate
transaction. A losing writer never returns its candidate signature.

## Migration

Contracts are not upgradeable. Deploy a fresh **local** ItemRegistry v2 and
compatible ItemNFT/binding graph, update SDK domain and ABI consumers, and
reject v1 item signatures. StateRegistry and Binding domains remain version 1.
Even unchanged item-destruction structs now use Item Registry domain 2.
Do not retarget an immutable registry or silently copy ownership/lineage into a
new collection. Any deployed real-asset migration requires separate review.

New file snapshots use schemaVersion 2. Legacy progress may load for inspection,
but nonzero progress without deployment/game context fails closed at issuance:
never fabricate missing signatures or reset to zero. Archive the old store,
reconcile issued and accepted history against the exact deployment, then perform
an explicit reviewed migration. Changing domain/game requires separate state.

## Limits

The outbox tracks **issued** checkpoints. No automatic submitted/confirmed
tracker, reorganization reconciler, relayer, retention/compaction policy or
achievement outbox is implemented. A rejected statement must retain its facts;
retry after the dependency is repaired, or pause and reconcile. Revocation,
policy changes and ownership/game mismatch can make renewal insufficient.
SQLite is a local database, not multi-host HA. Per-process quotas and a static
game scope are reference controls, not tenant-wide credential/abuse management.
