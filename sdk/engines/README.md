# PoPLY engine adapters

These adapters connect a publisher-controlled dedicated game server to the
PoPLY Publisher Verifier API. They are deliberately thin: engine code owns game
events, while the verifier owns canonicalization, PoPL calculation, signing,
and protocol validation.

## Security boundary

Never ship `POPLY_PUBLISHER_API_KEY` in a player build. The Unity and Unreal
adapters are intended for headless/dedicated server targets. The Godot adapter
is intended for a trusted authoritative server process. Client builds should
send authenticated gameplay results to the publisher's normal game backend;
that backend invokes PoPLY.

All adapters expose two operations:

- submit a checkpoint candidate to `POST /v1/checkpoints`;
- submit an achievement candidate to `POST /v1/achievements`.

Payloads use the JSON formats in `docs/openapi.yaml`; reusable fixtures are in
`sdk/engines/fixtures/`.

## Unity

Copy `unity/Runtime/PoPLYPublisherClient.cs` into a dedicated-server assembly.
Drive its coroutine from a `MonoBehaviour`. The adapter uses
`UnityWebRequest`, `UploadHandlerRaw`, and a buffered response.

## Unreal Engine

Copy the `unreal/Source/PoPLY` module into the project and add `PoPLY` to the
server target. The module depends on Unreal's `HTTP` module. Keep it out of the
shipping client target.

## Godot

Copy `godot/addons/poply` into the project and instantiate
`PoPLYPublisherClient` in the authoritative server scene. One adapter node may
process one request at a time; use a pool for concurrent submissions.

The adapters are source-level reference integrations. They require compilation
inside their target engine CI because those toolchains are not part of this
repository's Node/Foundry test environment.

## Godot sample integration (`godot/sample/`)

A runnable, headless dedicated-server-style project that exercises the poply
addon against a live publisher verifier: it must receive a signed checkpoint
(201) and then a structured `sequence_conflict` (409) on sequence replay.

```bash
npm run e2e:godot        # boots the verifier, copies the addon in, runs the scene
```

The harness resolves the Godot binary from `GODOT_BIN`, then `godot` on PATH,
then the macOS app bundle. No chain is involved — the verifier signs
off-chain, which is exactly the surface an engine adapter uses. To open the
sample in the editor, run the harness once (it copies `addons/poply` into the
project) and open `sdk/engines/godot/sample/project.godot`.

Unity and Unreal equivalents still need real-engine compilation/CI (tracked
as the remainder of roadmap T1).
