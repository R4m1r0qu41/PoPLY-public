import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";

export type LicenseMode = 1 | 2 | 3 | 4 | 5 | 6;

const licensingAbi = [
  {
    type: "function",
    name: "isCharacterLocked",
    stateMutability: "view",
    inputs: [{ name: "characterContract", type: "address" }, { name: "tokenId", type: "uint256" }],
    outputs: [{ name: "locked", type: "bool" }],
  },
  {
    type: "function",
    name: "createOffer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "characterContract", type: "address" }, { name: "tokenId", type: "uint256" },
      { name: "allowedLicensee", type: "address" }, { name: "mode", type: "uint8" },
      { name: "price", type: "uint96" }, { name: "duration", type: "uint64" },
      { name: "deadline", type: "uint64" }, { name: "termsHash", type: "bytes32" },
      { name: "exclusive", type: "bool" },
    ],
    outputs: [{ name: "offerId", type: "uint256" }],
  },
  { type: "function", name: "acceptOffer", stateMutability: "payable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
] as const satisfies Abi;

export interface CreateLicenseOfferRequest {
  characterContract: Address;
  tokenId: bigint;
  allowedLicensee: Address;
  mode: LicenseMode;
  price: bigint;
  duration: bigint;
  deadline: bigint;
  termsHash: Hex;
  /** When true the license immobilizes the NFT for its duration; false leaves it tradeable. */
  exclusive: boolean;
}

export function isCharacterLocked(
  client: Pick<PublicClient, "readContract">,
  licensingContract: Address,
  characterContract: Address,
  tokenId: bigint,
): Promise<boolean> {
  return client.readContract({ address: licensingContract, abi: licensingAbi, functionName: "isCharacterLocked", args: [characterContract, tokenId] });
}

export function createLicenseOffer(
  client: Pick<WalletClient, "writeContract">,
  licensingContract: Address,
  request: CreateLicenseOfferRequest,
): Promise<Hex> {
  return client.writeContract({ address: licensingContract, abi: licensingAbi, functionName: "createOffer", args: [request.characterContract, request.tokenId, request.allowedLicensee, request.mode, request.price, request.duration, request.deadline, request.termsHash, request.exclusive] } as never);
}

export function acceptLicenseOffer(
  client: Pick<WalletClient, "writeContract">,
  licensingContract: Address,
  offerId: bigint,
  price: bigint,
): Promise<Hex> {
  return client.writeContract({ address: licensingContract, abi: licensingAbi, functionName: "acceptOffer", args: [offerId], value: price } as never);
}
