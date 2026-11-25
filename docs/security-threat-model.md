# PoPLY v0.1 security threat model

Status: Reference MVP baseline
Date: 2026-07-04

## Scope

This model covers the Character NFT, Royalty Registry, Verifier Registry, State
Registry, Licensing contract, Marketplace contract, publisher verifier API,
local sequence store, SDK, engine adapters, relayer boundary, metadata/evidence
commitments, and reference arena.

It does not certify production safety. Chain bridges, production account
abstraction, external marketplaces, AI model providers, phygital secure-element
manufacturing, and publisher game infrastructure require separate assessments.

## Protected assets

- character ownership and transfer authority;
- accepted PoP and PoA history;
- active license exclusivity and terms commitment;
- seller, creator, licensor, and protocol proceeds;
- publisher verifier and administrator keys;
- checkpoint sequence and pending-submission state;
- metadata and evidence integrity and availability;
- player account mappings and off-chain personal data; and
- publisher reputation and legal rights in licensed characters.

## Actors and trust

| Actor | Authority | Not trusted for |
| --- | --- | --- |
| Character owner | transfer, approval, listing, licensing | publisher gameplay facts |
| Publisher verifier | PoP/PoA facts for its game | transfer or withdrawal |
| Relayer | transaction submission | message alteration or authority |
| Protocol administrator | verifier/minter/fee configuration | forging player signatures |
| Licensee | use under committed terms | ownership or early unlock |
| Marketplace | approved atomic transfer and allocation | bypassing active lock |
| Metadata host | content availability | changing committed content undetected |
| Chain validators | ordered execution/finality assumptions | precise wall-clock time |

## Trust boundaries

1. Player or engine client to publisher game backend.
2. Publisher game backend to PoPLY verifier API.
3. Verifier state database and signing key boundary.
4. Signed envelope to untrusted relayer.
5. RPC/indexer to chain contracts.
6. Contract events to marketplace and publisher UI.
7. Public commitments to private metadata/evidence stores.

## Threats and controls

### Forged or replayed gameplay proof

Threats: unauthorized signer, cross-chain replay, cross-deployment replay,
duplicate sequence, skipped history, expired envelope, signature malleability,
achievement replay.

Controls: EIP-712 chain and contract domain, active Verifier Registry lookup,
exact sequence increment, one achievement ID per character, deadline, low-`s`
and valid-`v` checks, game/character binding, and zero-commitment rejection.

Residual risk: a compromised authorized verifier can attest false gameplay until
revoked. Production needs hardware-backed keys, rotation, anomaly monitoring,
and incident response.

### Sequence race or restart corruption

Threats: two requests issue the same sequence, process restart forgets progress,
partial file write, issued proof never reaches chain, chain reorganization.

Controls: per-character in-process serialization, atomic file replacement,
strict state-file parsing, and contract enforcement of the accepted sequence.

Residual risk: the reference file store is single-process and records issued,
not accepted, state. Production needs a transactional database, idempotency
keys, pending/accepted states, outbox, chain reconciliation, and reorg policy.

### Unauthorized character transfer

Threats: unapproved operator, zero receiver, stale marketplace listing, transfer
during active license, malicious receiver contract.

Controls: ERC-721 owner/operator approval checks, safe receiver callback,
license-manager delegation frozen after wiring, transfer-time lock check,
marketplace ownership recheck, and atomic transaction rollback.

Residual risk: owner credential or wallet compromise remains outside contract
authorization. Recovery requires an explicit identity/account architecture.

### License bypass or denial

Threats: ownership alone creates revenue, multiple concurrent licenses, stale
owner accepts proceeds, duration overflow, early administrator unlock, game
server ignores lock.

Controls: on-chain PoPL gate, one character-keyed active license, ownership
recheck, checked arithmetic, no early-unlock function, automatic time expiry,
and Character NFT transfer enforcement.

Residual risk: simultaneous gameplay is enforced only by publisher session
admission. Legal rights and breach remedies live in the committed terms.

### Settlement theft, reentrancy, or griefing

Threats: callback reentrancy, recipient rejection, fee/royalty over-allocation,
royalty redirection, exact-payment mismatch, stale listing.

Controls: checks-effects-interactions, reentrancy guard, pull payments, exact
payment, fee caps, sum check, immutable one-time Royalty Registry record,
ownership and lock rechecks.

Residual risk: administrator can change future protocol fee configuration within
the contract cap. Production should timelock and disclose changes.

### Metadata or evidence attack

Threats: host outage, mutable URI, malicious media, guessable hash input,
personal data in a public commitment, evidence deletion.

Controls: content commitments, strict schemas, no on-chain raw evidence, URI
separation, additional-property rejection for character metadata, documented
data minimization.

Residual risk: hashes do not guarantee availability or anonymity. Production
needs replicated storage, content scanning, entropy analysis, retention, and
controller/processor allocation.

### API and adapter compromise

Threats: leaked bearer key, leaked verifier private key, oversized body,
malformed numeric values, concurrent request conflict, credentials compiled
into a player build.

Controls: required bearer authentication, 256 KiB body cap, strict address/hash
and decimal parsing, signing validation, serialized issuance, server-only engine
adapter guidance, `.env` exclusion.

Residual risk: reference API lacks TLS termination, rate limits, key-management
integration, audit log, distributed locking, request idempotency, and database
HA. It must remain behind publisher infrastructure.

### Administrative compromise

Threats: malicious verifier registration, unauthorized mint, fee redirection,
license-manager substitution before freeze.

Controls: separate explicit authorities, freeze function, no administrator
character transfer, no administrator proof forgery path, no royalty redirection.

Residual risk: reference deployment uses one admin for reproducibility.
Production requires role separation, multisig, delay, monitoring, runbooks, and
documented emergency scope.

### Privacy and correlation

Threats: wallet-to-account linking, ownership/proceeds profiling, child data,
NFC location history, AI prompt or chat publication.

Controls: opaque publisher IDs, no key storage in identity resolver,
privacy-rejecting analytics field names, off-chain AI and phygital data, public
commitments only.

Residual risk: public addresses and events can remain personal data. Launch
requires a data map, DPIA or equivalent, notices, lawful basis, retention,
rights handling, and age design.

## Security invariants with current tests

| Invariant | Test evidence |
| --- | --- |
| Active license blocks transfer | `testActiveLicenseLocksCharacterUntilExpiry` |
| Marketplace cannot bypass lock | `testLicenseCannotBeBypassedThroughMarketplace` |
| Ownership without PoPL cannot license | `testOwnershipWithoutPoPLCannotCreateLicenseOffer` |
| Checkpoint cannot skip/regress | history and time regression tests |
| Revoked/untrusted verifier cannot attest | `testOnlyActiveVerifierCanAttest` |
| Achievement cannot duplicate | checkpoint/achievement lifecycle test |
| Stale listing cannot settle | `testTransferInvalidatesStaleListing` |
| Settlement splits correctly | marketplace settlement test |
| Royalty cannot redirect | `testRoyaltyCannotBeRedirectedAfterMint` |
| SDK detects tampering | typed-data tampering test |
| Concurrent issuance serializes | SDK concurrency test |
| Restart preserves issued progress | file-store restart test |

## Production exit criteria

- independent contract and application security review;
- threat-model review with the selected publisher and chain;
- production database/outbox/reconciliation tests including reorg simulation;
- managed key custody, rotation exercise, and compromise drill;
- multisig/timelock and least-privilege deployment;
- load, abuse, parser, RPC failure, and chaos tests;
- metadata availability and malicious-content controls;
- privacy/child/legal launch approvals;
- target-engine build and credential scanning; and
- monitored pilot with transaction limits and rollback criteria.
