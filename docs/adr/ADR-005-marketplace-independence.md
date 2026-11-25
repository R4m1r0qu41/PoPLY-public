# ADR-005: Marketplace independence

- Status: Accepted for MVP
- Date: 2026-07-04

## Decision

PoPLY defines transfer-lock and royalty interfaces but does not require one
marketplace. The included fixed-price contract is a reference implementation
and end-to-end test surface.

The marketplace never escrows the Character NFT. It rechecks ownership and
lock status at settlement, transfers atomically, reads the ERC-2981 royalty,
and allocates pull-payment balances.

## Consequences

Publishers may integrate external markets without changing character identity.
Each operator remains responsible for consumer, payment, sanctions, tax, and
platform obligations. Indexing and user experience are not consensus concerns.
