import {
  hashTypedData,
  isAddress,
  isHex,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import type {
  Achievement,
  Checkpoint,
  SignedAchievement,
  SignedCheckpoint,
  StateRegistryDomain,
  TypedDataAccount,
} from "./types.ts";

export const checkpointTypes = {
  Checkpoint: [
    { name: "characterContract", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "gameId", type: "bytes32" },
    { name: "sequence", type: "uint64" },
    { name: "stateHash", type: "bytes32" },
    { name: "playTimeSeconds", type: "uint64" },
    { name: "popl", type: "uint16" },
    { name: "policyId", type: "bytes32" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const achievementTypes = {
  Achievement: [
    { name: "characterContract", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "gameId", type: "bytes32" },
    { name: "achievementId", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "occurredAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

export function stateRegistryDomain(
  chainId: number,
  verifyingContract: Address,
): StateRegistryDomain {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new RangeError("chainId must be a positive safe integer");
  }
  assertAddress(verifyingContract, "verifyingContract");
  return {
    name: "PoPLY State Registry",
    version: "1",
    chainId,
    verifyingContract,
  };
}

export function validateCheckpoint(checkpoint: Checkpoint): void {
  assertAddress(checkpoint.characterContract, "characterContract");
  assertUint(checkpoint.tokenId, UINT256_MAX, "tokenId");
  assertBytes32(checkpoint.gameId, "gameId", false);
  assertUint(checkpoint.sequence, UINT64_MAX, "sequence");
  if (checkpoint.sequence === 0n) throw new RangeError("sequence must begin at one");
  assertBytes32(checkpoint.stateHash, "stateHash", false);
  assertUint(checkpoint.playTimeSeconds, UINT64_MAX, "playTimeSeconds");
  if (!Number.isInteger(checkpoint.popl) || checkpoint.popl < 0 || checkpoint.popl > 65_535) {
    throw new RangeError("popl must fit uint16");
  }
  assertBytes32(checkpoint.policyId, "policyId", false);
  assertUint(checkpoint.occurredAt, UINT64_MAX, "occurredAt");
  assertUint(checkpoint.deadline, UINT64_MAX, "deadline");
  if (checkpoint.deadline < checkpoint.occurredAt) {
    throw new RangeError("deadline cannot precede occurredAt");
  }
}

export function validateAchievement(achievement: Achievement): void {
  assertAddress(achievement.characterContract, "characterContract");
  assertUint(achievement.tokenId, UINT256_MAX, "tokenId");
  assertBytes32(achievement.gameId, "gameId", false);
  assertBytes32(achievement.achievementId, "achievementId", false);
  assertBytes32(achievement.evidenceHash, "evidenceHash", false);
  assertUint(achievement.occurredAt, UINT64_MAX, "occurredAt");
  assertUint(achievement.deadline, UINT64_MAX, "deadline");
  if (achievement.deadline < achievement.occurredAt) {
    throw new RangeError("deadline cannot precede occurredAt");
  }
}

export function checkpointDigest(
  domain: StateRegistryDomain,
  checkpoint: Checkpoint,
): Hex {
  validateCheckpoint(checkpoint);
  return hashTypedData({
    domain,
    types: checkpointTypes,
    primaryType: "Checkpoint",
    message: checkpoint,
  });
}

export function achievementDigest(
  domain: StateRegistryDomain,
  achievement: Achievement,
): Hex {
  validateAchievement(achievement);
  return hashTypedData({
    domain,
    types: achievementTypes,
    primaryType: "Achievement",
    message: achievement,
  });
}

export async function signCheckpoint(
  account: TypedDataAccount,
  domain: StateRegistryDomain,
  checkpoint: Checkpoint,
): Promise<SignedCheckpoint> {
  validateCheckpoint(checkpoint);
  const signature = await account.signTypedData({
    domain,
    types: checkpointTypes,
    primaryType: "Checkpoint",
    message: checkpoint,
  });
  return { checkpoint, signature, signer: account.address };
}

export async function signAchievement(
  account: TypedDataAccount,
  domain: StateRegistryDomain,
  achievement: Achievement,
): Promise<SignedAchievement> {
  validateAchievement(achievement);
  const signature = await account.signTypedData({
    domain,
    types: achievementTypes,
    primaryType: "Achievement",
    message: achievement,
  });
  return { achievement, signature, signer: account.address };
}

export async function verifyCheckpointSignature(
  domain: StateRegistryDomain,
  signed: SignedCheckpoint,
): Promise<boolean> {
  validateCheckpoint(signed.checkpoint);
  return verifyTypedData({
    address: signed.signer,
    domain,
    types: checkpointTypes,
    primaryType: "Checkpoint",
    message: signed.checkpoint,
    signature: signed.signature,
  });
}

export async function verifyAchievementSignature(
  domain: StateRegistryDomain,
  signed: SignedAchievement,
): Promise<boolean> {
  validateAchievement(signed.achievement);
  return verifyTypedData({
    address: signed.signer,
    domain,
    types: achievementTypes,
    primaryType: "Achievement",
    message: signed.achievement,
    signature: signed.signature,
  });
}

function assertAddress(value: Address, field: string): void {
  if (!isAddress(value, { strict: true })) throw new TypeError(`${field} is not a valid address`);
}

function assertBytes32(value: Hex, field: string, allowZero: boolean): void {
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new TypeError(`${field} must be bytes32`);
  }
  if (!allowZero && /^0x0{64}$/.test(value)) throw new RangeError(`${field} cannot be zero`);
}

function assertUint(value: bigint, maximum: bigint, field: string): void {
  if (typeof value !== "bigint" || value < 0n || value > maximum) {
    throw new RangeError(`${field} is outside its unsigned integer range`);
  }
}
