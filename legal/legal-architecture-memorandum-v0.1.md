# PoPLY legal architecture memorandum v0.1

Date: 2026-07-04
Status: Product and engineering issue map; counsel review required

## Purpose and limits

This memorandum maps legal issues created by the PoPLY reference architecture
and converts them into product controls. It is not legal advice, does not select
a launch jurisdiction, and does not conclude that any particular token, license,
marketplace, tournament, or payment flow is lawful. Local counsel must review
the actual operator entities, contracts, marketing, custody, payment path,
player ages, and countries before a pilot.

The baseline review covers the United States and European Union because they
illustrate the main classifications. Every launch country also requires local
consumer, tax, gambling, money-transmission, sanctions, privacy, and IP review.

## System facts assumed

- PoPLY has no protocol token and promises no passive yield.
- A Character NFT records game identity, ownership, metadata commitments, and a
  royalty configuration.
- Publishers remain authoritative for gameplay, anti-cheat, progression, and
  admission.
- Publisher verifiers sign PoP checkpoints and PoA attestations.
- PoPL gates optional licensing; it does not grant competitive power.
- A license is time bounded and locks transfer while active.
- The reference marketplace is non-custodial at the asset layer but coordinates
  listings and allocates ETH sale proceeds through contract credits.
- Detailed gameplay, evidence, personal data, AI behavior, and NFC scans remain
  off-chain.

Changing any assumption may change the analysis.

## Executive risk classification

| Area | MVP risk | Primary control |
| --- | --- | --- |
| Securities/financial promotion | Medium | Collectible/utility design; no profit or managerial-return promises |
| Money transmission/AML | High if operator controls settlement or exchange | Obtain flow-of-funds opinion; use regulated providers; avoid custody |
| Tax reporting | High for an operated marketplace | Determine broker/RCASP status before transactions |
| Consumer protection | High | Plain ownership/license terms, fee disclosure, remedies, support |
| Privacy | High | No personal data on-chain; DPIA/data map; scoped off-chain retention |
| Children | High for general-audience games | Age design, parental consent where required, no child marketplace by default |
| Gambling/contests | Medium to high by feature and jurisdiction | No chance-based consideration/prize loop; separate tournament review |
| IP/licensing | High | Rights inventory and mode-specific license schedule |
| Sanctions | High for open settlement | Wallet and counterparty controls, blocking/escalation procedure |
| AI characters | Medium to high | Rights, safety, disclosure, audit, and data-use terms |
| Phygital goods | Medium | Separate physical title, digital entitlement, returns, loss, and revocation terms |

## 1. Character classification and securities controls

The U.S. SEC's March 2026 interpretation distinguishes digital collectibles and
other non-security crypto assets from transactions that may nevertheless form
an investment contract. The SEC's small-business guidance continues to focus on
an investment of money in a common enterprise with a reasonable expectation of
profits derived from essential managerial efforts. A collectible label does not
override marketing and transaction facts.

PoPLY's no-token, no-passive-yield, gameplay-first design lowers but does not
eliminate risk. Licensing revenue, royalties, scarcity, resale, publisher
roadmaps, and marketplace support could be marketed in a way that creates a
profit expectation tied to publisher efforts.

Required controls:

- market characters for gameplay identity, provenance, and licensed utility;
- prohibit appreciation, guaranteed liquidity, income, or return language;
- do not pool sale proceeds to fund promised ecosystem development without a
  securities analysis;
- do not represent PoPL as an investment score or expected-revenue rating;
- disclose that licensing depends on eligibility, demand, publisher approval,
  local law, and character unavailability during the license;
- review primary drops, airdrops, bundles, and secondary-market campaigns as
  complete transactions, not token labels; and
- require securities counsel sign-off for every public sale structure.

In the EU, MiCA recitals state that genuinely unique and non-fungible
collectibles may fall outside the regulation, while fractional interests and
large series or collections can indicate fungibility; authorities apply a
substance-over-form analysis. The NFT label therefore cannot be the basis for
launching an EU marketplace without classifying the assets and services. If
MiCA applies, offer, white-paper, marketing, and crypto-asset service provider
requirements may follow.

## 2. Marketplace, payments, AML, and sanctions

The contract's pull-payment model is technically non-custodial with respect to
the character, but the operator still designs the market, receives fees, and
may control the interface, relayer, allowlist, fee recipient, or upgrade path.
Those facts matter more than the term “non-custodial.”

FinCEN guidance treats a business that accepts and transmits convertible virtual
currency, or buys or sells it for others, as a money transmitter unless an
exception applies. Counsel must map each party and smart-contract step,
including who can change, pause, redirect, or recover settlement. Use of a
regulated marketplace or payment provider is the preferred pilot architecture.

OFAC sanctions obligations are risk based and do not disappear because a
contract is public. A production operator needs a written sanctions program,
counterparty and wallet screening appropriate to its control, blocked-property
and rejected-transaction procedures, escalation, recordkeeping, geolocation
controls where lawful, and a response plan for newly designated addresses.

Do not add an administrator seizure function merely to create the appearance of
compliance. Administrative power should be limited, disclosed, multisig
controlled, and supported by a legal-operational procedure.

## 3. Tax information reporting

The 2026 IRS Form 1099-DA instructions require brokers effecting customer sales
of digital assets after 2025 to report gross proceeds, with specific optional
aggregate treatment and a de minimis rule for certain specified NFT sales.
Whether a PoPLY operator is a broker or digital-asset middleman depends on the
actual service, custody, agency, and payment processing facts.

Before a U.S. marketplace pilot:

- obtain a written broker-reporting classification;
- decide who collects tax identity and residency information;
- support transaction, fee, royalty, creator/minter, and proceeds records;
- allocate responsibility among publisher, marketplace, and payment provider;
- give users transaction exports without describing them as tax advice; and
- preserve corrections and statement-delivery workflows.

EU DAC8 rules apply from 1 January 2026 and require reporting crypto-asset
service providers to collect reportable transaction and user information, with
the first reporting exchange following the 2026 reporting year. EU operation
therefore needs an RCASP classification and due-diligence design before launch.

## 4. Consumer ownership, licensing, and marketing

“Ownership” must be decomposed in the consumer contract. Token ownership does
not automatically convey copyright, trademark, publicity, model, voice,
game-access, server-availability, cross-game compatibility, commercial-use, or
physical-goods rights.

The purchase screen and terms should state, before payment:

- the exact token and contractual license received;
- whether game access can end and what persists afterward;
- publisher authority over balance, compatibility, moderation, and admission;
- transfer and license-lock restrictions;
- marketplace, gas, royalty, protocol, and payment-provider fees;
- metadata hosting and continuity expectations;
- refund, failed-transaction, mistaken-transfer, and support rules;
- jurisdiction, dispute, and complaint paths; and
- tax consequences and reporting roles.

In the EU, Directive 2019/770 imposes conformity and remedy rules for supplied
digital content and services, including functionality, compatibility,
interoperability, security updates, and termination remedies. Marketing must not
promise universal portability where permission and technical support are
publisher specific.

If the marketplace qualifies as an online platform under the Digital Services
Act, notice-and-action, transparency, statement-of-reasons, interface, and other
obligations may apply. Article 30 requires covered marketplaces facilitating
consumer distance contracts with traders to collect and assess specified trader
identity information.

## 5. Privacy and public-ledger design

Wallet addresses, ownership history, license activity, and play commitments may
be personal data when linkable to a person. A hash is not anonymous merely
because the preimage is not published.

PoPLY should preserve these constraints:

- never put names, emails, government IDs, precise location, IP addresses,
  voiceprints, raw match logs, chat, prompts, NFC scan history, or report text
  on-chain;
- do not commit low-entropy sensitive values without a secret salt or stronger
  proof design;
- separate account identity from public wallet identity wherever possible;
- define controller/processor roles among protocol operator, publisher,
  marketplace, indexer, and infrastructure providers;
- complete a data-protection impact assessment before public proof publication;
- document purpose, lawful basis, retention, access, deletion, correction,
  portability, objection, and breach handling for off-chain records;
- treat public-chain permanence and third-party indexing as constraints in the
  privacy notice; and
- provide a wallet-rotation/account-recovery design that does not claim to erase
  public history.

The EDPB's Guidelines 02/2025 on blockchain processing were published for public
consultation in 2025. They are useful risk guidance but should not be described
as final binding law without checking their status at launch.

## 6. Children and age assurance

Games often serve minors. The U.S. COPPA Rule applies to child-directed online
services and general-audience services with actual knowledge that they collect
personal information from children under 13. The FTC's 2025 amendments added
requirements including separate parental opt-in for certain third-party
disclosures, retention limits, and expanded personal-information categories;
the general one-year compliance period from the April 2025 publication has
elapsed as of this memorandum.

Default product policy:

- no marketplace, external wallet, resale, or paid license for known child
  accounts unless a reviewed parental and jurisdictional flow expressly allows
  it;
- minimize age-assurance data and delete it promptly when its sole purpose is
  age determination;
- separate parental consent from general terms;
- do not use PoP, wallet, or NFC activity for targeted advertising to children;
- provide parent access/deletion controls for off-chain child data; and
- review every launch country's child privacy, age-appropriate design, contract
  capacity, and spending rules.

The FTC's February 2026 enforcement policy describes conditions for limited
age-verification collection without prior parental consent; it is narrow and
must not be generalized to other data uses.

## 7. Gambling, tournaments, and no-pay-to-win

Skill-based competition, paid entry, prizes, random drops, and secondary value
can combine differently under local gambling, contest, sweepstakes, and arcade
laws. A blockchain record does not change the underlying elements.

Protocol defaults:

- PoPL derives from verified activity, not purchased chance;
- ownership does not increase combat power;
- no wager, loot-box, random paid mint, or chance-based reward is part of the
  core protocol;
- tournament licensing is disabled until publisher counsel approves rules,
  eligibility, geography, age, prize, tax, and integrity controls; and
- the marketplace must not be presented as a way to cash out gambling rewards.

Every tournament or randomized commercial mechanic requires a separate feature
memorandum by jurisdiction.

## 8. Intellectual property and character licensing

The terms hash is evidence of a specific document; it does not create missing
rights. Each license mode needs a human-readable schedule covering:

- character art, name, lore, animation, voice, music, trademarks, and publicity;
- territory, media, channels, game versions, audience, and term;
- exclusivity and the technical lock's legal meaning;
- modification, derivative works, generated output, and approval rights;
- user-generated content and creator-association claims;
- sublicensing, contractors, AI model providers, and promotional partners;
- quality, moderation, takedown, indemnity, and insurance;
- revenue, taxes, statements, audit, refunds, and chargebacks;
- termination, expiry, cached copies, archival use, and survival; and
- infringement, impersonation, and emergency suspension.

Publishers must verify that player-created characters and imported assets do not
contain unlicensed third-party IP. Provenance proves history, not clearance.

## 9. AI character extension

AI-mode licensing adds model-provider terms, training-data restrictions, voice
and likeness rights, safety rules, disclosure, human oversight, audit logs,
prompt and memory privacy, and generated-output ownership. A character owner
cannot license a publisher's model or a performer's voice unless the owner holds
those rights.

AI behavior and player conversations remain off-chain. The public manifest
should contain only capabilities, operator, safety-policy identity, license
reference, URI, and content commitment. EU AI Act, GDPR, consumer, platform,
copyright, biometric, employment, and sector rules require a use-case analysis;
“NPC” or “agent” is not a legal classification.

## 10. Phygital extension

A phygital product can create separate contracts for the physical good, digital
content, online service, and character token. Terms must specify whether returns,
loss, theft, resale, device failure, chargeback, or revocation affect each layer.

Static NFC identifiers are clonable and should not authorize high-value claims.
Secure-element keys, fresh challenges, one-time nonces, issuer attestations, and
privacy-preserving identifiers are product security requirements, not evidence
that the user legally owns every associated right.

## 11. Contract and operational allocation

Before pilot, identify the legal entity for each role:

| Role | Required allocation |
| --- | --- |
| Protocol administrator | Verifier/minter/fee authority, incident duties, governance promises |
| Publisher | Gameplay facts, anti-cheat, PoPL policy, game access, content rights |
| Marketplace operator | Listings, trader status, payments, tax, sanctions, complaints |
| Licensor | Rights warranty, approval, performance, tax identity |
| Licensee | Permitted use, safety, reporting, expiry, takedown |
| Metadata host | Availability, integrity, moderation, retention |
| Key/relayer provider | Signing controls, transaction authority, outage and compromise response |
| Player | Account security, lawful content, transaction confirmation, tax responsibility |

The smart contracts do not replace these agreements.

## 12. Mandatory launch gates

No public marketplace or paid licensing pilot should launch until all gates have
named owners and written approval:

1. selected countries, age bands, currencies/assets, and operator entities;
2. securities/financial-promotion classification of the offering and marketing;
3. money-transmission, AML/KYC, sanctions, custody, and payment flow opinion;
4. U.S. broker and EU RCASP/DAC8 tax reporting classification where applicable;
5. consumer terms, character rights schedule, marketplace terms, privacy notice,
   and complaint/refund process;
6. data map, DPIA or equivalent assessment, retention schedule, and incident plan;
7. child-account and age-assurance design;
8. gambling/contest review for each tournament or randomized mechanic;
9. IP chain-of-title and AI/voice/likeness rights review;
10. smart-contract audit, multisig/timelock, key management, monitoring, and
    emergency procedures; and
11. tax, accounting, insurance, and customer-support readiness.

## Sources checked

- [SEC 2026 crypto-asset interpretation](https://www.sec.gov/rules-regulations/2026/03/s7-2026-09)
- [SEC small-business guidance on crypto-asset transactions](https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/transactions-involving-crypto-assets)
- [EU Markets in Crypto-Assets Regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1114)
- [FinCEN convertible virtual currency guidance](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering)
- [OFAC sanctions guidance for the virtual currency industry](https://ofac.treasury.gov/system/files/126/virtual_currency_guidance_brochure.pdf)
- [IRS 2026 Form 1099-DA instructions](https://www.irs.gov/instructions/i1099da)
- [European Commission DAC8 guidance](https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en)
- [EU Digital Services Act](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng)
- [EU Digital Content Directive summary](https://eur-lex.europa.eu/legal-content/EN/LSU/?uri=celex%3A32019L0770)
- [EDPB Guidelines 02/2025 consultation page](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-022025-processing-personal-data_en)
- [FTC 2025 COPPA amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments)
- [FTC 2026 age-verification enforcement policy](https://www.ftc.gov/news-events/news/press-releases/2026/02/ftc-issues-coppa-policy-statement-incentivize-use-age-verification-technologies-protect-children)

Sources were checked on 2026-07-04. Counsel must re-check them and applicable
national/state implementation before launch.
