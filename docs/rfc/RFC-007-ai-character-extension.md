# RFC-007: AI character extension

- Status: Draft
- Version: 0.1.0

## Scope

This extension allows a licensed character to be instantiated as an NPC,
companion, quest giver, seasonal boss, or agent-controlled participant. It does
not place inference, memory, prompts, or model weights on-chain.

## Separation of concerns

- Character ownership remains in the Character NFT.
- Permission to use the character remains in a time-bounded PoPLY license.
- The license terms hash commits to permitted games, roles, channels, and
  commercial terms.
- An off-chain behavior manifest describes capabilities and safety policy.
- A publisher-owned runtime executes the behavior and remains responsible for
  moderation, privacy, latency, and game balance.
- Proof-of-Play records meaningful outcomes only when the publisher verifier
  accepts them under an identified policy.

Ownership of a character does not imply ownership of a model, voice, training
data, prompt, or third-party IP. A license cannot grant rights that its licensor
does not hold.

## Behavior manifest

The manifest defined by `schemas/ai-agent-profile.schema.json` commits to:

- the PoPLY character and game;
- the active license identifier and expiry;
- an immutable behavior manifest URI and content hash;
- declared capabilities and prohibited capabilities;
- publisher safety-policy identity; and
- runtime operator identity.

The manifest must not contain secrets, private player data, model credentials,
or live memory. Its hash may be included in license terms or publisher audit
records.

## Runtime admission

Before an AI session begins, the publisher must confirm:

1. the character exists and matches the game;
2. the caller is the active licensee or its authorized operator;
3. the license is active and its mode permits AI use;
4. the behavior manifest hash matches the licensed terms;
5. the safety policy is approved for the game and jurisdiction; and
6. the character is not simultaneously admitted to prohibited gameplay.

If chain access is unavailable, a publisher may use a short-lived cached license
decision. It must fail closed after the cache expires.

## Privacy and safety

AI-generated speech and actions are game content under publisher control. The
runtime must provide abuse reporting, audit correlation, data minimization, and
age-appropriate safeguards. PoPLY does not claim that blockchain provenance
makes generated output truthful, safe, or rights-cleared.
