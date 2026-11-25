# Relic Harbor: one game, one cosmetic asset class

Working concept, 2026-10-08. A product hypothesis, not a commissioned game,
verified market opportunity or licensed use of another game's IP.

## Recommendation

Build a small original co-op exploration game with a social building hub.
Use **expedition relics** as the first PoPLY asset class: cosmetic artifacts
with attributable discovery and transformation histories. Start with synthetic
assets and no trading interface. A Godot server integration is the lowest
verification-cost starting point here because its transport has a local E2E
sample; that does not establish a production multiplayer server.

A full MMO or Roblox-scale creator platform adds content moderation, creator
rights, server operations and economy complexity before provenance has shown
value. Test the play loop and a single provenance use case first.

## The game players experience

Four explorers leave a harbor for a 15-minute expedition through a ruined
floating island. They cooperate on traversal, salvage and environmental
puzzles, then return to decorate a communal workshop. The island's layout and
optional side objectives vary. Sessions work without a wallet or chain service.

The repeatable loop is: choose an expedition → cooperate and explore → recover
a relic → customize its appearance → display it in the harbor → invite friends.
The attraction is shared discovery and expression, not financial earnings.
For the vertical slice: one island, three puzzles, one hub, one relic family,
three visual states and four-player private sessions. No PvP, land sales,
open creator marketplace, paid random drops or speculative scarcity economy.

## Asset choice

| Candidate | Appeal | First-pilot tradeoff |
| --- | --- | --- |
| Expedition relic / cosmetic trophy | Origin, story and visual lineage are legible | Recommended: no combat advantage, small content set |
| Companion appearance | Strong identity and promotional-appearance potential | Later: animation/behavior scope and licensing complexity |
| Crafted blueprint | Connects to sandbox creativity | Later: creator IP, copying and production rights |
| Land / powerful weapons | Obvious economy hooks | Reject initially: gameplay exclusion, balancing and speculation risk |

A relic is an item token, not a transferable player identity. Its receipt names
publisher, game, collection/ID, class, manifest URI commitment and origin
commitment. Detailed expedition evidence remains off-chain and access-controlled.
Two ordinary players can earn similar appearances: no scarce advantage or
exclusive access is required to make a particular instance's history interesting.

Visual restoration transforms class v1 → v2 → v3 through next-sequence/prior-class
attestations. Gameplay renders restoration immediately from the publisher's
inventory; chain work follows asynchronously. Inventory admission enforces one
live mapping per item ID and avoids simultaneous duplicated admission during
ownership transitions. The contract cannot enforce that mapping alone.

## How this maps to the current implementation

- Issue a relic through Item Registry v2, committing an exact content-addressed URI.
- Show original publisher attribution, transformation sequence and evidence status.
- Keep expedition character progression in StateRegistry checkpoints.
- Exercise response loss, restart, expiry, same-fact renewal and duplicate relay.
- Demonstrate optional releasable equipment binding on a synthetic character.
- Use character appearance licensing only in a later explicit publisher agreement.

The existing Marketplace is for characters; it is **not** an item trading
product. Do not advertise an item resale feature until item settlement,
listing policy and admission reconciliation are implemented and reviewed.
PoPL character eligibility must not be described as an existing item-market gate.

## Rights and availability

A receipt proves publisher attribution and token ownership, not ownership of
copyright or perpetual server access. Define personal display permission,
creator attribution, moderation/removal conditions and shutdown exports.
Archive a manifest and licensed preview media in the synthetic recovery demo;
verify retrieved bytes against a content-addressed identifier. The runtime's
URI commitment alone does not supply those services.

## Existing platforms: inspiration versus hosting

Checked official rules on 2026-10-08. These observations are scoped to the
proposed PoPLY layer; they are not exhaustive platform/legal approval.

| Platform | Evidence | Pilot implication |
| --- | --- | --- |
| Minecraft | Usage guidelines restrict mods checking out-of-game entitlement to alter game features, including NFT-gated skins | Use building/exploration inspiration in original IP rather than an NFT-entitlement mod |
| Roblox | Advertising standards prohibit NFT and NFT-platform promotion | Do not assume an NFT marketplace can be promoted or integrated; Roblox-native cosmetics would need a separate platform-compatible design |
| Fortnite / UEFN | Developer rules prohibit external island links/off-Fortnite calls to action; Sponsored Row excludes blockchain products | An island can test fun, but do not assume PoPLY wallet/settlement integration is supported |
| Original Godot/Unity/Unreal game | Publisher controls inventory, server and IP | Best engineering fit; distribution terms and studio authorization still need review |

Sources: [Minecraft guidelines](https://www.minecraft.net/en-us/usage-guidelines),
[Roblox advertising standards](https://en.help.roblox.com/hc/en-us/articles/13722260778260-Advertising-Standards),
[Fortnite developer rules](https://legal.epicgames.com/fortnite/developer-rules?lang=en-US).
The Roblox advertising restriction alone does not prove a universal ban on all
external provenance systems. Absence of a keyword in a platform rule is not
permission to attach an external asset economy.

## Pilot measurement and decision

Propose a two-stage test. First, run the same expedition without economic
features and evaluate whether players choose another expedition and understand
the relic's story. Then add a provenance inspector with synthetic ownership
transitions and compare comprehension/support burden, not speculative volume.

Record server integration hours, lost/retried/rejected responses, restart/backup
recovery success, issuance-to-confirmation lag once a tracker exists, inventory
mapping violations, evidence availability and player comprehension. Predeclare
cohort definitions and retention analysis before collecting results; a small
pilot cannot establish causal commercial value by itself.

Proceed only if the play loop works and attributable provenance addresses a
named publisher/player problem. If interest is limited to resale speculation,
keep cosmetics in the ordinary game database. The next product action is a
vertical-slice specification with one studio owner; it is not a live-asset launch.
