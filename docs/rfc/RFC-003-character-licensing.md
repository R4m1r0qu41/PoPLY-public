# RFC-003: Character licensing

- Status: Implemented for MVP
- Version: 0.1.0

## Objective

Create a time-bounded, economically meaningful character-use commitment without
granting passive revenue to ownership alone.

## Eligibility and modes

The owner must meet the Licensing contract's minimum PoPL. Modes are NPC,
tournament, seasonal boss, story campaign, promotional appearance, and AI
agent. An offer binds the character, owner, optional licensee, mode, price,
duration, acceptance deadline, and immutable terms hash.

## State machine

```text
absent -> offered -> active -> expired -> settled
                   \-> unavailable if owner changed
offered -> cancelled
```

Acceptance rechecks ownership, deadline, licensee, payment, eligibility lock,
and existing lock. It creates one active license and allocates proceeds to pull
balances. Expiry stops the lock by time even before explicit settlement.

## Enforcement boundary

The Character NFT rejects transfers while `isCharacterLocked` is true. A
publisher must perform the same check before admitting the character to a game
session. The contract cannot prevent a game server that ignores the protocol
from rendering or controlling a copied character.

Early termination, disputes, sublicensing, refunds, content approvals, and
legal rights are terms-layer concerns deferred from the MVP contract.
