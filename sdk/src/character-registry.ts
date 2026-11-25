import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";

const characterAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "gameIdOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "gameId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "metadataCommitmentOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "commitment", type: "bytes32" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "gameId", type: "bytes32" },
      { name: "metadataCommitment", type: "bytes32" },
      { name: "uri", type: "string" },
      { name: "royaltyReceiver", type: "address" },
      { name: "royaltyBps", type: "uint16" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export interface MintCharacterRequest {
  to: Address;
  tokenId: bigint;
  gameId: Hex;
  metadataCommitment: Hex;
  uri: string;
  royaltyReceiver: Address;
  royaltyBps: number;
}

export async function readCharacter(
  client: Pick<PublicClient, "readContract">,
  characterContract: Address,
  tokenId: bigint,
): Promise<{ owner: Address; gameId: Hex; metadataCommitment: Hex }> {
  const [owner, gameId, metadataCommitment] = await Promise.all([
    client.readContract({ address: characterContract, abi: characterAbi, functionName: "ownerOf", args: [tokenId] }),
    client.readContract({ address: characterContract, abi: characterAbi, functionName: "gameIdOf", args: [tokenId] }),
    client.readContract({ address: characterContract, abi: characterAbi, functionName: "metadataCommitmentOf", args: [tokenId] }),
  ]);
  return { owner, gameId, metadataCommitment };
}

export async function mintCharacter(
  client: Pick<WalletClient, "writeContract">,
  characterContract: Address,
  request: MintCharacterRequest,
): Promise<Hex> {
  if (request.royaltyBps < 0 || request.royaltyBps > 10_000) {
    throw new RangeError("royaltyBps must be between 0 and 10000");
  }
  return client.writeContract({
    address: characterContract,
    abi: characterAbi,
    functionName: "mint",
    args: [
      request.to,
      request.tokenId,
      request.gameId,
      request.metadataCommitment,
      request.uri,
      request.royaltyReceiver,
      request.royaltyBps,
    ],
  } as never);
}
