import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteVerifierStateStore } from "../backend/src/sqlite-state-store.ts";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { PublisherVerifier } from "../sdk/src/publisher-verifier.ts";
import { checkpointDigest, achievementDigest, stateRegistryDomain } from "../sdk/src/typed-data.ts";
import {
  bindingDomain,
  bindingDigest,
  itemIssuanceDigest,
  itemDestructionDigest,
  itemTransformationDigest,
  signItemTransformation,
  itemRegistryDomain,
  signBinding,
  signItemDestruction,
  signItemIssuance,
} from "../sdk/src/item-typed-data.ts";
import { mintCharacter } from "../sdk/src/character-registry.ts";
import { acceptLicenseOffer, createLicenseOffer } from "../sdk/src/licensing-client.ts";
import { buyListing, createListing } from "../sdk/src/marketplace-client.ts";

interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
}

const rpcUrl = process.env.POPLY_RPC_URL ?? "http://127.0.0.1:8547";
const transport = http(rpcUrl);
const admin = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const verifierAccount = privateKeyToAccount("0x00000000000000000000000000000000000000000000000000000000000a11ce");
const licensee = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000b0b");
const buyer = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000c0c");

const publicClient = createPublicClient({ chain: foundry, transport });
const testClient = createTestClient({ chain: foundry, mode: "anvil", transport });
const adminWallet = createWalletClient({ account: admin, chain: foundry, transport });
const licenseeWallet = createWalletClient({ account: licensee, chain: foundry, transport });
const buyerWallet = createWalletClient({ account: buyer, chain: foundry, transport });

const artifacts = {
  verifierRegistry: await artifact("VerifierRegistry.sol", "VerifierRegistry"),
  stateRegistry: await artifact("StateRegistry.sol", "StateRegistry"),
  character: await artifact("CharacterNFT.sol", "CharacterNFT"),
  licensing: await artifact("Licensing.sol", "Licensing"),
  marketplace: await artifact("Marketplace.sol", "Marketplace"),
  royaltyRegistry: await artifact("RoyaltyRegistry.sol", "RoyaltyRegistry"),
  itemRegistry: await artifact("ItemRegistry.sol", "ItemRegistry"),
  itemNFT: await artifact("ItemNFT.sol", "ItemNFT"),
  binding: await artifact("CharacterItemBinding.sol", "CharacterItemBinding"),
};

await testClient.setBalance({ address: licensee.address, value: parseEther("10") });
await testClient.setBalance({ address: buyer.address, value: parseEther("10") });

const verifierRegistry = await deploy(artifacts.verifierRegistry, [admin.address]);
const stateRegistry = await deploy(artifacts.stateRegistry, [verifierRegistry]);
const royaltyRegistry = await deploy(artifacts.royaltyRegistry, []);
// Licensing is deployed before the NFT: CharacterNFT takes an immutable license manager, and the
// VerifierRegistry doubles as the publisher licensing policy.
const licensing = await deploy(artifacts.licensing, [
  admin.address,
  stateRegistry,
  verifierRegistry,
  admin.address,
  250,
  1,
]);
const character = await deploy(artifacts.character, [
  "PoPLY Arena Characters",
  "PAC",
  admin.address,
  royaltyRegistry,
  licensing,
]);
const marketplace = await deploy(artifacts.marketplace, [
  admin.address,
  licensing,
  stateRegistry,
  admin.address,
  250,
]);
// RFC-009 item layer: the ItemNFT's registry and binding manager are immutable, so both deploy
// first; ItemNFT last.
const itemRegistry = await deploy(artifacts.itemRegistry, [verifierRegistry]);
const binding = await deploy(artifacts.binding, [verifierRegistry]);
const itemNFT = await deploy(artifacts.itemNFT, [
  "PoPLY Arena Items",
  "PAI",
  admin.address,
  itemRegistry,
  binding,
]);

const publisherId = keccak256(stringToHex("cipherlayer.reference-publisher"));
const gameId = keccak256(stringToHex("poply.reference-arena.v1"));
await write(adminWallet, artifacts.verifierRegistry.abi, verifierRegistry, "registerPublisher", [
  publisherId,
  false,
  0n,
]);
await write(adminWallet, artifacts.verifierRegistry.abi, verifierRegistry, "assignGame", [
  gameId,
  publisherId,
]);
await write(adminWallet, artifacts.verifierRegistry.abi, verifierRegistry, "configureVerifier", [
  verifierAccount.address,
  publisherId,
  true,
]);
// Relax marketplace eligibility so the demo can list immediately; production keeps the
// 30-day / 30-hour / level-3 defaults.
await write(adminWallet, artifacts.marketplace.abi, marketplace, "configureListingEligibility", [
  0n,
  0n,
  0,
]);
await confirm(
  await mintCharacter(adminWallet, character, {
    to: admin.address,
    tokenId: 1n,
    gameId,
    metadataCommitment: keccak256(stringToHex("reference-character-metadata-v1")),
    uri: "ipfs://poply-reference/1",
    royaltyReceiver: admin.address,
    royaltyBps: 500,
  }),
  "mint",
);

const latest = await publicClient.getBlock();
const now = latest.timestamp;
const publisher = new PublisherVerifier({
  account: verifierAccount,
  domain: stateRegistryDomain(foundry.id, stateRegistry),
  now: () => now,
});
const signedCheckpoint = await publisher.issueCheckpoint({
  characterContract: character,
  tokenId: 1n,
  gameId,
  sequence: 1n,
  state: { arena: "reference-01", result: "victory", xp: 120 },
  playTimeSeconds: 3_600n,
  achievementCount: 1,
});
assert.equal(await publicClient.readContract({ address: stateRegistry, abi: artifacts.stateRegistry.abi, functionName: "checkpointDigest", args: [signedCheckpoint.checkpoint] }), checkpointDigest(publisher.domain, signedCheckpoint.checkpoint));
await write(adminWallet, artifacts.stateRegistry.abi, stateRegistry, "submitCheckpoint", [
  signedCheckpoint.checkpoint,
  signedCheckpoint.signature,
]);
const signedAchievement = await publisher.issueAchievement({
  characterContract: character,
  tokenId: 1n,
  gameId,
  achievement: "FIRST_WIN",
  evidence: { arena: "reference-01", matchId: "local-e2e-1" },
});
assert.equal(await publicClient.readContract({ address: stateRegistry, abi: artifacts.stateRegistry.abi, functionName: "achievementDigest", args: [signedAchievement.achievement] }), achievementDigest(publisher.domain, signedAchievement.achievement));
await write(adminWallet, artifacts.stateRegistry.abi, stateRegistry, "submitAchievement", [
  signedAchievement.achievement,
  signedAchievement.signature,
]);

// Verified-Issuance item lifecycle: a signed issuance attestation mints the item (uniqueness is
// the anti-dupe guarantee), a verifier-attested binding locks it to the character, and the
// binding is severed permissionlessly after the character is sold below.
const itemDomain = itemRegistryDomain(foundry.id, itemRegistry);
const signedIssuance = await signItemIssuance(verifierAccount, itemDomain, {
  itemContract: itemNFT,
  tokenId: 1n,
  gameId,
  itemClassId: keccak256(stringToHex("item.sword-of-ages.v1")),
  originHash: keccak256(stringToHex("drop:world-boss:local-e2e")),
  metadataHash: keccak256(stringToHex("ipfs://poply-items/1")),
  owner: admin.address,
  occurredAt: now,
  deadline: now + 900n,
});
assert.equal(await publicClient.readContract({ address: itemRegistry, abi: artifacts.itemRegistry.abi, functionName: "issuanceDigest", args: [signedIssuance.issuance] }), itemIssuanceDigest(itemDomain, signedIssuance.issuance));
await write(adminWallet, artifacts.itemRegistry.abi, itemRegistry, "submitIssuance", [
  signedIssuance.issuance,
  signedIssuance.signature,
  "ipfs://poply-items/1",
]);
const signedTransformation = await signItemTransformation(verifierAccount, itemDomain, {
  itemContract: itemNFT, tokenId: 1n, gameId, sequence: 1n,
  previousItemClassId: signedIssuance.issuance.itemClassId,
  newItemClassId: keccak256(stringToHex("item.sword-of-ages.v2")),
  transformHash: keccak256(stringToHex("local-reforge")), occurredAt: now, deadline: now + 900n,
});
assert.equal(await publicClient.readContract({ address: itemRegistry, abi: artifacts.itemRegistry.abi, functionName: "transformationDigest", args: [signedTransformation.transformation] }), itemTransformationDigest(itemDomain, signedTransformation.transformation));
await write(adminWallet, artifacts.itemRegistry.abi, itemRegistry, "submitTransformation", [signedTransformation.transformation, signedTransformation.signature]);
const signedBinding = await signBinding(
  verifierAccount,
  bindingDomain(foundry.id, binding),
  {
    characterContract: character,
    characterId: 1n,
    itemContract: itemNFT,
    itemId: 1n,
    releasable: true,
    occurredAt: now,
    deadline: now + 900n,
  },
);
await write(adminWallet, artifacts.binding.abi, binding, "bind", [
  signedBinding.binding,
  signedBinding.signature,
]);
assert.equal(await publicClient.readContract({ address: binding, abi: artifacts.binding.abi, functionName: "bindingDigest", args: [signedBinding.binding] }), bindingDigest(bindingDomain(foundry.id, binding), signedBinding.binding));
const itemLockedWhileBound = await publicClient.readContract({
  address: binding,
  abi: artifacts.binding.abi,
  functionName: "isItemLocked",
  args: [itemNFT, 1n],
});
if (itemLockedWhileBound !== true) throw new Error("binding did not lock the item");

await confirm(
  await createLicenseOffer(adminWallet, licensing, {
    characterContract: character,
    tokenId: 1n,
    allowedLicensee: licensee.address,
    mode: 1,
    price: parseEther("1"),
    duration: 3_600n,
    deadline: now + 900n,
    termsHash: keccak256(stringToHex("local-npc-license-v1")),
    exclusive: true,
  }),
  "createOffer",
);
await confirm(
  await acceptLicenseOffer(licenseeWallet, licensing, 1n, parseEther("1")),
  "acceptOffer",
);
const locked = await publicClient.readContract({
  address: licensing,
  abi: artifacts.licensing.abi,
  functionName: "isCharacterLocked",
  args: [character, 1n],
});
if (locked !== true) throw new Error("license did not lock the character");

await testClient.increaseTime({ seconds: 3_601 });
await testClient.mine({ blocks: 1 });
await write(adminWallet, artifacts.character.abi, character, "approve", [marketplace, 1n]);
await confirm(
  await createListing(
    adminWallet,
    marketplace,
    character,
    1n,
    parseEther("2"),
    now + 86_400n,
  ),
  "createListing",
);
await confirm(await buyListing(buyerWallet, marketplace, 1n, parseEther("2")), "buy");

const finalOwner = await publicClient.readContract({
  address: character,
  abi: artifacts.character.abi,
  functionName: "ownerOf",
  args: [1n],
});
if (finalOwner !== buyer.address) throw new Error("marketplace did not transfer the character");

// The character left the bound owner in the sale above, so anyone may sever the stale binding —
// the item must not stay locked to a character its owner lost.
await write(adminWallet, artifacts.binding.abi, binding, "settleOrphanedBinding", [itemNFT, 1n]);
const itemLockedAfterSale = await publicClient.readContract({
  address: binding,
  abi: artifacts.binding.abi,
  functionName: "isItemLocked",
  args: [itemNFT, 1n],
});
if (itemLockedAfterSale !== false) throw new Error("binding was not severed after character sale");

// Destruction is terminal: the item burns and its token id can never be re-issued.
const latestAfterSale = await publicClient.getBlock();
const signedDestruction = await signItemDestruction(verifierAccount, itemDomain, {
  itemContract: itemNFT,
  tokenId: 1n,
  gameId,
  occurredAt: latestAfterSale.timestamp,
  deadline: latestAfterSale.timestamp + 900n,
});
assert.equal(await publicClient.readContract({ address: itemRegistry, abi: artifacts.itemRegistry.abi, functionName: "destructionDigest", args: [signedDestruction.destruction] }), itemDestructionDigest(itemDomain, signedDestruction.destruction));
await write(adminWallet, artifacts.itemRegistry.abi, itemRegistry, "submitDestruction", [
  signedDestruction.destruction,
  signedDestruction.signature,
]);
const itemDestroyed = await publicClient.readContract({
  address: itemRegistry,
  abi: artifacts.itemRegistry.abi,
  functionName: "destroyed",
  args: [itemNFT, 1n],
});
if (itemDestroyed !== true) throw new Error("item destruction was not recorded as terminal");

// Lost-response/restart and expiry recovery against the actual deployed registry.
// Synthetic local token only; never rewind or substitute another state at sequence 1.
await confirm(await mintCharacter(adminWallet, character, {
  to: admin.address, tokenId: 2n, gameId,
  metadataCommitment: keccak256(stringToHex("recovery-demo")), uri: "ipfs://poply-reference/2",
  royaltyReceiver: admin.address, royaltyBps: 500,
}), "mintRecoveryCharacter");
const recoveryDirectory = mkdtempSync(join(tmpdir(), "poply-e2e-recovery-"));
let recoveryStore = new SqliteVerifierStateStore(join(recoveryDirectory, "state.sqlite"));
try {
  let clock = (await publicClient.getBlock()).timestamp;
  const options = { account: verifierAccount, domain: publisher.domain, now: () => clock };
  let recoveryVerifier = new PublisherVerifier({ ...options, stateStore: recoveryStore });
  const request = { characterContract: character, tokenId: 2n, gameId, sequence: 1n,
    state: { expedition: "synthetic" }, playTimeSeconds: 60n, achievementCount: 0,
    idempotencyKey: "recovery-demo-1" };
  const original = await recoveryVerifier.issueCheckpoint(request);
  recoveryStore.close();
  recoveryStore = new SqliteVerifierStateStore(join(recoveryDirectory, "state.sqlite"));
  recoveryVerifier = new PublisherVerifier({ ...options, stateStore: recoveryStore });
  assert.deepEqual(await recoveryVerifier.issueCheckpoint(request), original);
  await testClient.increaseTime({ seconds: 901 });
  await testClient.mine({ blocks: 1 });
  clock = (await publicClient.getBlock()).timestamp;
  await assert.rejects(publicClient.simulateContract({ address: stateRegistry,
    abi: artifacts.stateRegistry.abi, functionName: "submitCheckpoint",
    args: [original.checkpoint, original.signature], account: admin.address }), /PayloadExpired/);
  const renewed = await recoveryVerifier.renewCheckpoint(request, 1n);
  assert.deepEqual({ ...renewed.checkpoint, deadline: original.checkpoint.deadline }, original.checkpoint);
  await write(adminWallet, artifacts.stateRegistry.abi, stateRegistry, "submitCheckpoint",
    [renewed.checkpoint, renewed.signature]);
  await assert.rejects(publicClient.simulateContract({ address: stateRegistry,
    abi: artifacts.stateRegistry.abi, functionName: "submitCheckpoint",
    args: [renewed.checkpoint, renewed.signature], account: admin.address }), /InvalidSequence/);
  assert.deepEqual(recoveryVerifier.recoverCheckpoint(request, 1n), original);
} finally {
  recoveryStore.close();
  rmSync(recoveryDirectory, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: "ok",
  chainId: foundry.id,
  recovery: { restart: true, expiredOriginalRejected: true, sameStateRenewalAccepted: true, replayRejected: true },
  contracts: {
    verifierRegistry,
    stateRegistry,
    royaltyRegistry,
    character,
    licensing,
    marketplace,
    itemRegistry,
    itemNFT,
    binding,
  },
  lifecycle: {
    mintedTokenId: "1",
    checkpointSequence: "1",
    achievement: "FIRST_WIN",
    licenseLocked: locked,
    licenseExpired: true,
    finalOwner,
  },
  items: {
    issuedTokenId: "1",
    lockedWhileBound: itemLockedWhileBound,
    bindingSeveredAfterSale: itemLockedAfterSale === false,
    destroyedTerminally: itemDestroyed,
  },
}, null, 2)}\n`);

async function artifact(source: string, contract: string): Promise<Artifact> {
  const raw = await readFile(new URL(`../out/${source}/${contract}.json`, import.meta.url), "utf8");
  return JSON.parse(raw) as Artifact;
}

async function deploy(contractArtifact: Artifact, args: readonly unknown[]): Promise<Address> {
  const hash = await adminWallet.deployContract({
    abi: contractArtifact.abi,
    bytecode: contractArtifact.bytecode.object,
    args,
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("deployment did not return a contract address");
  return receipt.contractAddress;
}

async function write(
  wallet: ReturnType<typeof createWalletClient>,
  abi: Abi,
  address: Address,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<void> {
  const hash = await wallet.writeContract({ abi, address, functionName, args, value } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} transaction reverted`);
}

async function confirm(hash: Hex, operation: string): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${operation} transaction reverted`);
}
