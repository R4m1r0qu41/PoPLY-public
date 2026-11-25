# ADR-006: Single-chain MVP and multi-chain deferral

- Status: Accepted for MVP
- Date: 2026-07-04

## Decision

The MVP supports one EVM deployment and exercises it on a local Anvil chain.
Messages are bound to chain ID and registry address. No bridge, wrapped
character, mirrored license, or cross-chain marketplace claim is part of v0.1.

## Rationale

Multi-chain ownership introduces canonical-asset, replay, bridge compromise,
conflicting transfer, and conflicting-license risks before publisher value has
been validated. Abstracting deployment configuration is not the same as solving
those protocol questions.

## Future gate

A multi-chain RFC must define canonical ownership, finality, bridge trust,
recovery, message replay, metadata identity, license conflict resolution, and
exit behavior. Until then, production documentation must name exactly one
supported chain.
