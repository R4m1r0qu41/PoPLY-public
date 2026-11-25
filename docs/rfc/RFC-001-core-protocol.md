# RFC-001: PoPLY core protocol

- Status: Draft implemented by MVP
- Version: 0.1.0

## Roles

- **Protocol administrator:** manages verifiers, minters, contract wiring, and
  fee configuration.
- **Publisher verifier:** signs authoritative game checkpoints and achievements.
- **Relayer:** submits signed data and pays transaction fees; it receives no
  special authority.
- **Character owner:** controls transfer, listing, and licensing decisions.
- **Licensee:** receives a time-bounded right described by an immutable terms
  commitment.

## Character identity

A character is the tuple `(characterContract, tokenId)`. Its mint record binds
an immutable `gameId`, initial metadata commitment, and metadata URI. Dynamic
progression is recorded separately by the State Registry.

## State transitions

```text
unminted -> owned -> listed -> owned
                    \-> licensed -> owned
owned -> transferred -> owned-by-new-owner
```

Listing does not lock a character. A transfer invalidates a stale listing.
Licensing does lock a character. Transfers revert while a license is active.

## Protocol invariants

1. Only an authorized minter can create a character.
2. An active license prevents every character transfer.
3. At most one active license exists for a character.
4. A checkpoint cannot overwrite or skip accepted history.
5. Verified play time and PoPL never decrease.
6. An achievement ID is unique per character.
7. Only an active verifier signature can create PoP or PoA state.
8. A marketplace purchase cannot bypass a licensing lock.
9. Settlement uses pull payments so recipients cannot block protocol progress.
10. Protocol and royalty fees cannot exceed the sale or license proceeds.

## Failure and recovery

Expired signed payloads and offers are safely unusable. Revoked verifiers cannot
create new accepted state. Expired licenses stop locking automatically even if
no settlement transaction is sent. Stale marketplace listings fail if ownership
or approval changed.

Administrative recovery is deliberately limited: administrators cannot transfer
characters or forge gameplay attestations. Emergency pause and upgrade behavior
are deferred and must be specified before production deployment.
