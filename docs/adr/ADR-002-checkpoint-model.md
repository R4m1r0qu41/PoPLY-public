# ADR-002: Checkpoint canonicalization and signing model

- Status: Accepted for MVP
- Date: 2026-07-03

## Decision

PoP checkpoints and PoA attestations use EIP-712 typed structured data. The
domain is:

```text
name: PoPLY State Registry
version: 1
chainId: deployment chain ID
verifyingContract: StateRegistry address
```

Every payload binds the character contract, token ID, game ID, and a deadline.
Checkpoints use a per-character sequence beginning at one, and each accepted
sequence must be exactly one greater than the previous value. Play time and PoPL
are monotonic. `policyId` identifies the off-chain rules used to calculate PoPL.

Achievements use an `achievementId` that may be accepted only once for a given
character. `evidenceHash` commits to publisher-held or content-addressed
supporting evidence without publishing that evidence on-chain.

Signatures must be canonical secp256k1 signatures. The registry rejects invalid
`v`, high-`s` signatures, expired payloads, zero commitments, unknown
characters, and signers that are not active at submission time.

## Replay boundaries

EIP-712 binds signatures to a chain and registry deployment. Character identity,
game identity, sequence or achievement identity, and deadline prevent replay
inside that deployment.
