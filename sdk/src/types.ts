import type { Address, Hex } from "viem";

export type UnixSeconds = bigint;

export interface StateRegistryDomain {
  name: "PoPLY State Registry";
  version: "1";
  chainId: number;
  verifyingContract: Address;
}

export interface Checkpoint {
  characterContract: Address;
  tokenId: bigint;
  gameId: Hex;
  sequence: bigint;
  stateHash: Hex;
  playTimeSeconds: bigint;
  popl: number;
  policyId: Hex;
  occurredAt: UnixSeconds;
  deadline: UnixSeconds;
}

export interface Achievement {
  characterContract: Address;
  tokenId: bigint;
  gameId: Hex;
  achievementId: Hex;
  evidenceHash: Hex;
  occurredAt: UnixSeconds;
  deadline: UnixSeconds;
}

export interface SignedCheckpoint {
  checkpoint: Checkpoint;
  signature: Hex;
  signer: Address;
}

export interface SignedAchievement {
  achievement: Achievement;
  signature: Hex;
  signer: Address;
}

export interface TypedDataAccount {
  address: Address;
  signTypedData(parameters: Record<string, unknown>): Promise<Hex>;
}
