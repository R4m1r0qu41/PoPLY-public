import type { Abi, Address, Hex, WalletClient } from "viem";

const marketplaceAbi = [
  {
    type: "function", name: "createListing", stateMutability: "nonpayable",
    inputs: [{ name: "characterContract", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "price", type: "uint96" }, { name: "deadline", type: "uint64" }],
    outputs: [{ name: "listingId", type: "uint256" }],
  },
  { type: "function", name: "cancelListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
] as const satisfies Abi;

export function createListing(
  client: Pick<WalletClient, "writeContract">,
  marketplace: Address,
  characterContract: Address,
  tokenId: bigint,
  price: bigint,
  deadline: bigint,
): Promise<Hex> {
  return client.writeContract({ address: marketplace, abi: marketplaceAbi, functionName: "createListing", args: [characterContract, tokenId, price, deadline] } as never);
}

export function cancelListing(
  client: Pick<WalletClient, "writeContract">,
  marketplace: Address,
  listingId: bigint,
): Promise<Hex> {
  return client.writeContract({ address: marketplace, abi: marketplaceAbi, functionName: "cancelListing", args: [listingId] } as never);
}

export function buyListing(
  client: Pick<WalletClient, "writeContract">,
  marketplace: Address,
  listingId: bigint,
  price: bigint,
): Promise<Hex> {
  return client.writeContract({ address: marketplace, abi: marketplaceAbi, functionName: "buy", args: [listingId], value: price } as never);
}
