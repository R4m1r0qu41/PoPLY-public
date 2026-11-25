# RFC-005: Publisher SDK

- Status: Implemented reference SDK
- Version: 0.1.0

## Boundary

The SDK translates publisher-authoritative facts into PoPLY messages and
transactions. It does not replace game authentication, anti-cheat, progression,
or key management.

Modules cover identity mapping, character registry access, canonical state,
PoP/PoA signing and verification, PoPL policy, licensing, marketplace actions,
and data-minimized analytics. The authenticated verifier API keeps private keys
server-side and persists issued progress.

Unity, Unreal, and Godot adapters are thin server transports. A player build
must not contain a publisher API key or verifier private key. Game clients send
results to the publisher's ordinary authenticated backend; that backend invokes
PoPLY.

All JSON unsigned integers use decimal strings unless the schema explicitly
uses a bounded JSON integer. Hashes and addresses use fixed-size `0x` hexadecimal
strings. Engine adapters share fixtures under `sdk/engines/fixtures`.

Production adapters require target-engine CI, retries with idempotency keys,
timeouts, observability, durable queueing, and pending/accepted chain
reconciliation.
