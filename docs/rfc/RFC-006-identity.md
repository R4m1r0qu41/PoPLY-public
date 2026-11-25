# RFC-006: Player and character identity

- Status: Implemented reference boundary
- Version: 0.1.0

## Separation

Publisher account identity, wallet address, and character identity are separate:

- publisher account: opaque off-chain player identifier;
- wallet: current control endpoint for ownership actions;
- character: `(characterContract, tokenId)` plus immutable game ID.

The public protocol never stores email, legal name, account credential, or
private key. The reference identity resolver stores only the opaque publisher
identifier, address, custody mode, and creation time.

## Invisible-Web3 path

A publisher may initially manage an account through a reviewed custody or
sponsored-wallet provider. Migration to player control updates the off-chain
mapping and transfers the character through the normal ownership path. The
reference resolver treats migration as one-way to avoid silently recapturing a
player-controlled account.

Production recovery, guardians, account abstraction, sanctions screening,
minor accounts, deceased users, and compromised credentials require a selected
wallet architecture and jurisdiction-specific policy before launch.
