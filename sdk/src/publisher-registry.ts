import { keccak256, stringToHex, type Abi, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

const verifierRegistryAbi = [
  {
    type: "function",
    name: "registerPublisher",
    stateMutability: "nonpayable",
    inputs: [
      { name: "publisherId", type: "bytes32" },
      { name: "openLicensing", type: "bool" },
      { name: "minPublicOfferPrice", type: "uint96" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "assignGame",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }, { name: "publisherId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "configureVerifier",
    stateMutability: "nonpayable",
    inputs: [
      { name: "signer", type: "address" },
      { name: "publisherId", type: "bytes32" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isVerifierForGame",
    stateMutability: "view",
    inputs: [{ name: "signer", type: "address" }, { name: "gameId", type: "bytes32" }],
    outputs: [{ name: "allowed", type: "bool" }],
  },
  {
    type: "function",
    name: "publisherOfGame",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [{ name: "publisherId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "publicOfferAllowed",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }, { name: "price", type: "uint96" }],
    outputs: [{ name: "allowed", type: "bool" }],
  },
] as const satisfies Abi;

/** Deterministic publisher id from a stable slug (e.g. "roblox"). Matches keccak256(bytes(slug)). */
export function publisherIdFromSlug(slug: string): Hex {
  return keccak256(stringToHex(slug));
}

/** Deterministic game id from a stable slug (e.g. "roblox.natural-disaster-survival"). */
export function gameIdFromSlug(slug: string): Hex {
  return keccak256(stringToHex(slug));
}

export interface RegisterPublisherRequest {
  publisherId: Hex;
  openLicensing: boolean;
  minPublicOfferPrice: bigint;
}

export function registerPublisher(
  client: Pick<WalletClient, "writeContract">,
  registry: Address,
  request: RegisterPublisherRequest,
): Promise<Hex> {
  return client.writeContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "registerPublisher",
    args: [request.publisherId, request.openLicensing, request.minPublicOfferPrice],
  } as never);
}

export function assignGame(
  client: Pick<WalletClient, "writeContract">,
  registry: Address,
  gameId: Hex,
  publisherId: Hex,
): Promise<Hex> {
  return client.writeContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "assignGame",
    args: [gameId, publisherId],
  } as never);
}

export function configureVerifier(
  client: Pick<WalletClient, "writeContract">,
  registry: Address,
  signer: Address,
  publisherId: Hex,
  active: boolean,
): Promise<Hex> {
  return client.writeContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "configureVerifier",
    args: [signer, publisherId, active],
  } as never);
}

export function isVerifierForGame(
  client: Pick<PublicClient, "readContract">,
  registry: Address,
  signer: Address,
  gameId: Hex,
): Promise<boolean> {
  return client.readContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "isVerifierForGame",
    args: [signer, gameId],
  });
}

export function publisherOfGame(
  client: Pick<PublicClient, "readContract">,
  registry: Address,
  gameId: Hex,
): Promise<Hex> {
  return client.readContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "publisherOfGame",
    args: [gameId],
  });
}

export function publicOfferAllowed(
  client: Pick<PublicClient, "readContract">,
  registry: Address,
  gameId: Hex,
  price: bigint,
): Promise<boolean> {
  return client.readContract({
    address: registry,
    abi: verifierRegistryAbi,
    functionName: "publicOfferAllowed",
    args: [gameId, price],
  });
}
