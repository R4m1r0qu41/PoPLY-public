# RFC-004: Marketplace settlement

- Status: Implemented reference market
- Version: 0.1.0

## Objective

Demonstrate lock-aware secondary settlement while allowing publishers to use an
external marketplace instead of a protocol-controlled venue.

## Reference listing

A listing is fixed-price, ETH-denominated, non-custodial at the asset layer, and
time bounded. Creation requires current ownership and no active license. The
seller separately approves the marketplace to transfer the character.

Purchase rechecks listing state, deadline, exact payment, ownership, and
licensing lock. A transfer before purchase makes the listing stale and
unavailable.

## Settlement

The NFT's ERC-2981 response delegates to the standalone immutable Royalty
Registry. Seller proceeds, creator royalty, and protocol fee are credited as
pull payments. Royalty plus protocol fee cannot exceed the sale price.

## External integration

An external marketplace is compatible if it checks the PoPLY lock immediately
before transfer, honors transfer failure atomically, discloses fees, and handles
the legal, sanctions, consumer, and tax roles created by its operation.
