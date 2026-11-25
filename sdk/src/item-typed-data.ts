import {
  hashTypedData,
  isAddress,
  isHex,
  verifyTypedData,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import type { TypedDataAccount } from "./types.ts";

// Verified-Issuance signing (RFC-009): items are the second proof concept on the PoPLY
// substrate. Type strings here must match ItemRegistry.sol / CharacterItemBinding.sol typehash
// literals byte for byte — item-typed-data.test.ts guards the digests against drift.

export interface ItemRegistryDomain extends TypedDataDomain {
  name: "PoPLY Item Registry";
  version: "2";
  chainId: number;
  verifyingContract: Address;
}

export interface BindingDomain extends TypedDataDomain {
  name: "PoPLY Character Item Binding";
  version: "1";
  chainId: number;
  verifyingContract: Address;
}

export interface ItemIssuance {
  itemContract: Address;
  tokenId: bigint;
  gameId: Hex;
  itemClassId: Hex;
  originHash: Hex;
  /** keccak256 of the exact UTF-8 token URI; content availability is a separate obligation. */
  metadataHash: Hex;
  owner: Address;
  occurredAt: bigint;
  deadline: bigint;
}

export interface ItemDestruction {
  itemContract: Address;
  tokenId: bigint;
  gameId: Hex;
  occurredAt: bigint;
  deadline: bigint;
}

export interface ItemTransformation {
  itemContract: Address;
  tokenId: bigint;
  gameId: Hex;
  sequence: bigint;
  previousItemClassId: Hex;
  newItemClassId: Hex;
  transformHash: Hex;
  occurredAt: bigint;
  deadline: bigint;
}

export interface BindingRequest {
  characterContract: Address;
  characterId: bigint;
  itemContract: Address;
  itemId: bigint;
  releasable: boolean;
  occurredAt: bigint;
  deadline: bigint;
}

export interface SignedItemIssuance {
  issuance: ItemIssuance;
  signature: Hex;
  signer: Address;
}

export interface SignedItemDestruction {
  destruction: ItemDestruction;
  signature: Hex;
  signer: Address;
}

export interface SignedItemTransformation {
  transformation: ItemTransformation;
  signature: Hex;
  signer: Address;
}

export interface SignedBinding {
  binding: BindingRequest;
  signature: Hex;
  signer: Address;
}

export const itemIssuanceTypes = {
  ItemIssuance: [
    { name: "itemContract", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "gameId", type: "bytes32" },
    { name: "itemClassId", type: "bytes32" },
    { name: "originHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "owner", type: "address" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const itemDestructionTypes = {
  ItemDestruction: [
    { name: "itemContract", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "gameId", type: "bytes32" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const itemTransformationTypes = {
  ItemTransformation: [
    { name: "itemContract", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "gameId", type: "bytes32" },
    { name: "sequence", type: "uint64" },
    { name: "previousItemClassId", type: "bytes32" },
    { name: "newItemClassId", type: "bytes32" },
    { name: "transformHash", type: "bytes32" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const bindingTypes = {
  Binding: [
    { name: "characterContract", type: "address" },
    { name: "characterId", type: "uint256" },
    { name: "itemContract", type: "address" },
    { name: "itemId", type: "uint256" },
    { name: "releasable", type: "bool" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

export function itemRegistryDomain(chainId: number, verifyingContract: Address): ItemRegistryDomain {
  assertChain(chainId);
  assertAddress(verifyingContract, "verifyingContract");
  return { name: "PoPLY Item Registry", version: "2", chainId, verifyingContract };
}

export function bindingDomain(chainId: number, verifyingContract: Address): BindingDomain {
  assertChain(chainId);
  assertAddress(verifyingContract, "verifyingContract");
  return { name: "PoPLY Character Item Binding", version: "1", chainId, verifyingContract };
}

export function validateItemIssuance(issuance: ItemIssuance): void {
  assertAddress(issuance.itemContract, "itemContract");
  assertUint(issuance.tokenId, UINT256_MAX, "tokenId");
  assertBytes32(issuance.gameId, "gameId");
  assertBytes32(issuance.itemClassId, "itemClassId");
  assertBytes32(issuance.originHash, "originHash");
  assertBytes32(issuance.metadataHash, "metadataHash");
  assertAddress(issuance.owner, "owner");
  assertWindow(issuance.occurredAt, issuance.deadline);
}

export function validateItemDestruction(destruction: ItemDestruction): void {
  assertAddress(destruction.itemContract, "itemContract");
  assertUint(destruction.tokenId, UINT256_MAX, "tokenId");
  assertBytes32(destruction.gameId, "gameId");
  assertWindow(destruction.occurredAt, destruction.deadline);
}

export function validateItemTransformation(transformation: ItemTransformation): void {
  assertAddress(transformation.itemContract, "itemContract");
  assertUint(transformation.tokenId, UINT256_MAX, "tokenId");
  assertBytes32(transformation.gameId, "gameId");
  assertUint(transformation.sequence, UINT64_MAX, "sequence");
  if (transformation.sequence === 0n) throw new RangeError("sequence must be positive");
  assertBytes32(transformation.previousItemClassId, "previousItemClassId");
  assertBytes32(transformation.newItemClassId, "newItemClassId");
  assertBytes32(transformation.transformHash, "transformHash");
  assertWindow(transformation.occurredAt, transformation.deadline);
}

export function validateBindingRequest(binding: BindingRequest): void {
  assertAddress(binding.characterContract, "characterContract");
  assertUint(binding.characterId, UINT256_MAX, "characterId");
  assertAddress(binding.itemContract, "itemContract");
  assertUint(binding.itemId, UINT256_MAX, "itemId");
  if (typeof binding.releasable !== "boolean") throw new TypeError("releasable must be a boolean");
  assertWindow(binding.occurredAt, binding.deadline);
}

export function itemIssuanceDigest(domain: ItemRegistryDomain, issuance: ItemIssuance): Hex {
  validateItemIssuance(issuance);
  return hashTypedData({ domain, types: itemIssuanceTypes, primaryType: "ItemIssuance", message: issuance });
}

export function itemDestructionDigest(domain: ItemRegistryDomain, destruction: ItemDestruction): Hex {
  validateItemDestruction(destruction);
  return hashTypedData({
    domain,
    types: itemDestructionTypes,
    primaryType: "ItemDestruction",
    message: destruction,
  });
}

export function itemTransformationDigest(
  domain: ItemRegistryDomain,
  transformation: ItemTransformation,
): Hex {
  validateItemTransformation(transformation);
  return hashTypedData({
    domain,
    types: itemTransformationTypes,
    primaryType: "ItemTransformation",
    message: transformation,
  });
}

export function bindingDigest(domain: BindingDomain, binding: BindingRequest): Hex {
  validateBindingRequest(binding);
  return hashTypedData({ domain, types: bindingTypes, primaryType: "Binding", message: binding });
}

export async function signItemIssuance(
  account: TypedDataAccount,
  domain: ItemRegistryDomain,
  issuance: ItemIssuance,
): Promise<SignedItemIssuance> {
  validateItemIssuance(issuance);
  const signature = await account.signTypedData({
    domain,
    types: itemIssuanceTypes,
    primaryType: "ItemIssuance",
    message: issuance,
  });
  return { issuance, signature, signer: account.address };
}

export async function signItemDestruction(
  account: TypedDataAccount,
  domain: ItemRegistryDomain,
  destruction: ItemDestruction,
): Promise<SignedItemDestruction> {
  validateItemDestruction(destruction);
  const signature = await account.signTypedData({
    domain,
    types: itemDestructionTypes,
    primaryType: "ItemDestruction",
    message: destruction,
  });
  return { destruction, signature, signer: account.address };
}

export async function signItemTransformation(
  account: TypedDataAccount,
  domain: ItemRegistryDomain,
  transformation: ItemTransformation,
): Promise<SignedItemTransformation> {
  validateItemTransformation(transformation);
  const signature = await account.signTypedData({
    domain,
    types: itemTransformationTypes,
    primaryType: "ItemTransformation",
    message: transformation,
  });
  return { transformation, signature, signer: account.address };
}

export async function signBinding(
  account: TypedDataAccount,
  domain: BindingDomain,
  binding: BindingRequest,
): Promise<SignedBinding> {
  validateBindingRequest(binding);
  const signature = await account.signTypedData({
    domain,
    types: bindingTypes,
    primaryType: "Binding",
    message: binding,
  });
  return { binding, signature, signer: account.address };
}

export async function verifyItemIssuanceSignature(
  domain: ItemRegistryDomain,
  signed: SignedItemIssuance,
): Promise<boolean> {
  validateItemIssuance(signed.issuance);
  return verifyTypedData({
    address: signed.signer,
    domain,
    types: itemIssuanceTypes,
    primaryType: "ItemIssuance",
    message: signed.issuance,
    signature: signed.signature,
  });
}

function assertChain(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new RangeError("chainId must be a positive safe integer");
  }
}

function assertAddress(value: Address, field: string): void {
  if (!isAddress(value, { strict: true })) throw new TypeError(`${field} is not a valid address`);
}

function assertBytes32(value: Hex, field: string): void {
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new TypeError(`${field} must be bytes32`);
  }
  if (/^0x0{64}$/.test(value)) throw new RangeError(`${field} cannot be zero`);
}

function assertUint(value: bigint, maximum: bigint, field: string): void {
  if (typeof value !== "bigint" || value < 0n || value > maximum) {
    throw new RangeError(`${field} is outside its unsigned integer range`);
  }
}

function assertWindow(occurredAt: bigint, deadline: bigint): void {
  assertUint(occurredAt, UINT64_MAX, "occurredAt");
  assertUint(deadline, UINT64_MAX, "deadline");
  if (deadline < occurredAt) throw new RangeError("deadline cannot precede occurredAt");
}
