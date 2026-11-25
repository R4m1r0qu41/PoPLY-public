# ADR-001: Hybrid architecture and trust boundaries

- Status: Accepted for MVP
- Date: 2026-07-03

## Context

PoPLY must preserve real-time game performance while making ownership,
provenance, licensing, and settlement independently verifiable. Writing live
gameplay state to a blockchain would add latency, cost, and public data exposure
without improving play.

## Decision

Gameplay, anti-cheat, progression calculation, and PoPL policy execute in
publisher infrastructure. Authorized publisher verifiers sign versioned EIP-712
attestations. Relayers may submit those attestations. Contracts validate the
signature and store only commitments, monotonic counters, eligibility levels,
locks, and settlement records.

Players do not need to submit checkpoint transactions. A publisher may sponsor
all protocol writes and expose wallet creation only when a player chooses to
trade, license, or withdraw an asset.

The MVP uses one EVM deployment. Chain selection is a deployment decision; no
production chain is endorsed until operational and legal requirements are
evaluated.

## Trust boundaries

- A publisher is authoritative for gameplay facts originating in its game.
- PoPLY is authoritative for verifier status, accepted commitments, ownership,
  active licensing locks, and settlement.
- A verifier compromise can create false game attestations until revocation, but
  cannot directly transfer a player's character.
- A PoPLY administrator can authorize or revoke verifiers and configure protocol
  fees. Production deployment requires a multisig and delayed administration.
- Metadata availability is external to the contracts; hashes make alteration
  detectable but do not guarantee availability.

## Consequences

The protocol proves who attested to a game fact and that accepted history was not
silently rewritten. It does not prove that publisher game servers were honest.
Studios retain control of game balance and can evolve PoPL policy through
explicit policy identifiers.
