# PoPLY — Staged Business Model

*Status: strategy note, not a protocol spec. Sequencing discipline mirrors
`README.md` ("Delivery sequence") and the production gates in `STATUS.md`.
Nothing here authorises touching real chains, keys, or funds.*

---

## Positioning

PoPLY (Proof-of-Play Asset Layer) is publisher-oriented infrastructure for
persistent, verifiable, licensable game characters. It commits the minimum
durable provenance needed for independent verification; gameplay, progression,
matchmaking, and anti-cheat remain off-chain under the publisher's own
authority. **No protocol token, no passive yield, no pay-to-win, no unlicensed
cross-IP portability** — these are scope boundaries, not omissions, and each is
what keeps the core product out of a regulated category.

---

## The wedge — why Stage 0 is a business on its own

The entry product needs no crossover, no wagering, and no second publisher. A
single mid-size free-to-play (F2P) studio integrates PoPLY to convert the
account- and item-trading gray market it already loses value to into an
enforced, on-chain secondary-market royalty line (ERC-2981), while giving
players durable character provenance that survives bans, rollbacks, and title
sunset. The value is standalone and available on the first integration.

Everything more ambitious — seasonal guest characters, cross-title standing,
wagering arenas, persistent social worlds — is deferred behind milestones that
the wedge itself earns. If a later stage never unlocks, every stage before it
still stands as a business.

---

## Two design facts that make the sequence work

**Mid-size first, AAA as the win condition, not the entry point.** A large
studio has the most to lose, the slowest legal function, and the least reason
to bet on unproven infrastructure. A mid-size studio with a solid niche F2P
title has the inverse profile: real players generating real provenance, a gray
market it is actively losing money to, and enough institutional agility to
sign. Activision/Ubisoft is the outcome of a working pilot, not its
precondition.

**F2P resolves a cold-start problem, and the monetisation model protects the
asset.** Provenance has zero value on day one because no one has history yet —
a character is only worth something after the hours accrue. F2P funds the long
run-up during which provenance is being created but is not yet worth anything.
Critically, players buy **access to accrual** (play-extenders, season passes,
energy), never accrual itself. Selling the tier directly would poison the
"genuinely-played character" eligibility bar in `Marketplace.sol` and collapse
the gray-market recapture pitch. F2P-plus-time-extenders is what keeps PoPL
honest.

---

## Staged unlock model

| Stage | Product | Cross-publisher dependency | External permission required |
| --- | --- | --- | --- |
| **0 — Single studio** | Durable provenance + enforced secondary-market royalties + gray-market recapture | None | None |
| **1 — Instrumented pilot** | Same, run as a measurement instrument for retention / royalty / provenance-premium | None | None |
| **2 — Studio cohort** | Shared verifier standard, common marketplace liquidity, provenance that survives a title sunset | Soft — trust the *standard*, not each other | None |
| **3a — Seasonal NFT guests** (Kratos-in-MK model) | Bilateral, time-bounded, exclusive licence between two known studios | Hard | Per-deal IP-depiction licence |
| **3b — Provenance-gated dice arena, non-cashable stakes** | Asymmetric-variance competitive ladder; in-arena standing only | None | None |
| **3c — Persistent social environment** (Sims-style) | Host layer over cohort liquidity | Soft | Its own consumer-protection / duty-of-care posture |
| **3d — Dice arena, wagering for value** | Binary-outcome stakes on chance-weighted play | Hard | **Licensed gaming operator or sweepstakes-model partner fronting the activity** |

Stages 3a–3d are unordered and independently gated; each unlocks on its own
condition, not in sequence.

---

## The wall around the regulated tier

The wagering tier (3d) is the last unlock and is **structurally firewalled**.
PoPLY supplies the mechanic and the provenance; a licensed entity holds the
gaming permission and takes the regulatory position; the two are contractually
distinct so the core provenance business is never contaminated by the gambling
entity's risk. The correct counterparty is a licensed gaming operator, a B2B
gaming platform supplier, or a US sweepstakes-model operator — **not** an
event-derivatives exchange, whose licence rests on the argument that its
product is *not* gaming. The IP-depiction clearance (3a) and the gaming
permission (3d) never substitute for one another; they are separate
counterparties solving separate problems.

This is the same posture as a convertible-to-compliant, capital-buffered,
walled-from-the-core structure: the edgy revenue lives in a subsidiary that can
be firewalled or wound down without touching the thing that actually makes
money.

---

## Milestones are metrics, not dates

The pilot's job is to produce the three numbers that constitute both the next
studio pitch and the seed deck: **retention lift** attributable to provenance,
**secondary-market volume settled with enforced royalty**, and the average
**provenance premium** a genuinely-aged character commands over a fresh one.
Stage 2 has nothing to stand on until Stage 1 produces them. Do not fabricate
these in advance; the pilot exists to measure them.

---

## What PoPLY never becomes

Not an issuer of convertible currency. Not a gaming operator of record. Not a
depictor of IP it does not license. Not an execution layer that sits on the
critical path of a game action. The commercial upside above is bounded by these
lines on purpose — each crossed line is a different regulator, and the staged
model exists precisely so that none is crossed casually or before the standing
to cross it has been earned.
