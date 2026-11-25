# ADR-003: Publisher trust model

- Status: Accepted for MVP
- Date: 2026-07-04

## Decision

Publishers are authoritative for game-originated facts. PoPLY verifies the
identity and current authorization of the signer, message integrity, replay
boundaries, and monotonic history; it does not independently prove gameplay or
anti-cheat correctness.

Verifier registration is controlled by the protocol administrator. Revocation
is immediate for new submissions. Verifier private keys remain in managed
server infrastructure and never enter engine client builds.

## Consequences

A compromised verifier can create false PoP or PoA records until revoked. It
cannot transfer a character. Production requires separate verifier/minter/admin
keys, hardware-backed custody, rotation, monitoring, and incident response.
Contract-account signatures and quorum attestations are future extensions.
