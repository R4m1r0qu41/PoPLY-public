# Security policy

## Reference status

PoPLY v0.1 is an unaudited reference implementation. Do not deploy it with real
assets, customer funds, production signing keys, or personal data.

The repository intentionally omits production controls including managed key
custody, multisig/timelock administration, emergency response, chain
reorganization reconciliation, distributed rate limiting, database high availability,
wallet sanctions controls, and external contract audit.

## Reporting

Until a private reporting address is published, do not open a public issue that
contains an exploit, private key, credential, personal data, or step-by-step
attack against a live deployment. If this repository is hosted on GitHub, use a
private security advisory. There is currently no bug bounty or safe-harbor
program.

## Supported versions

No version is supported for production use. Security fixes target the current
development branch until a release policy is published.

## High-risk boundaries

- verifier key generation, storage, rotation, and revocation;
- checkpoint sequence persistence and chain reconciliation;
- licensing lock checks at publisher game-session admission;
- marketplace approvals, fees, royalties, withdrawals, and stale listings;
- administrator and fee authority;
- metadata and evidence availability;
- public-chain privacy and wallet correlation;
- engine builds accidentally containing publisher credentials; and
- AI behavior, phygital secure elements, and third-party integrations.

Any pilot must threat-model these boundaries and complete independent review.
