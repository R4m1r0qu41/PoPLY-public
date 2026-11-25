# ADR-004: Licensing lock

- Status: Accepted for MVP
- Date: 2026-07-04

## Decision

An accepted license creates one time-bounded lock keyed by character contract
and token ID. The Character NFT delegates transfer admission to the Licensing
contract and permanently freezes that manager address after deployment wiring.

The lock expires by timestamp without requiring a cleanup transaction. An
explicit settlement call removes expired storage. There is no administrator
early-unlock path in the MVP.

## Consequences

Transfer exclusivity is enforceable on-chain. Simultaneous-play exclusivity is
enforceable only when publishers check the same lock during session admission.
Timestamp variance is acceptable for commercial durations but must not be used
for sub-minute competitive timing.
