# RFC-008: Phygital character bindings

- Status: Draft
- Version: 0.1.0

## Scope

This extension binds an NFC-enabled figure, premium edition, convention item,
or esports collectible to a PoPLY character without treating possession of a
copyable identifier as proof of ownership.

## Model

A physical item contains a secure element capable of challenge-response
signatures. Its public key and issuer attestation are associated with a
character through the binding document in
`schemas/phygital-binding.schema.json`.

The physical item is not the Character NFT. A scan may prove proximity to a
device holding the secure key; it does not automatically transfer digital
ownership or legal title to the physical good.

## Claim flow

1. A trusted issuer provisions a unique secure-element key.
2. The issuer signs a binding over the device public key, product identity,
   character identity, manufacturing batch, and issuance time.
3. A claimant authenticates to the publisher and presents a fresh device
   challenge signature.
4. Publisher policy determines whether the scan grants a mint, cosmetic,
   achievement, temporary entitlement, or account binding.
5. A one-time claim nonce prevents reuse where the benefit is non-repeatable.

Printed serial numbers, static NFC URLs, and UID-only tags are insufficient for
high-value claims because they can be copied.

## Loss, resale, and revocation

The issuer must define whether the physical item and digital character transfer
together. Device compromise, manufacturing defects, returns, and lost items
require a signed revocation mechanism. Revocation of the physical binding must
not silently confiscate a separately owned Character NFT.

## Privacy

Public records should contain commitments, not scan histories or precise
location. The verifier must not use a globally stable physical identifier where
a scoped pseudonym is sufficient.
