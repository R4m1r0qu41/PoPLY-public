import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  parseEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assignGame,
  gameIdFromSlug,
  publisherIdFromSlug,
  registerPublisher,
} from "../sdk/src/publisher-registry.ts";

interface SeedGame {
  name: string;
  slug: string;
}

interface SeedPublisher {
  name: string;
  slug: string;
  openLicensing: boolean;
  minPublicOfferPriceEther: string;
  games: SeedGame[];
}

interface SeedFile {
  publishers: SeedPublisher[];
}

const broadcast = process.argv.includes("--broadcast");
const configArg = process.argv.find((arg, index) => index >= 2 && !arg.startsWith("--"));
const configPath = configArg
  ? new URL(configArg, `file://${process.cwd()}/`)
  : new URL("./publishers.seed.json", import.meta.url);

const seed = JSON.parse(readFileSync(configPath, "utf8")) as SeedFile;
if (!Array.isArray(seed.publishers) || seed.publishers.length === 0) {
  throw new TypeError("seed file must contain a non-empty publishers array");
}

// Validate: unique publisher slugs, and every game owned by exactly one publisher.
const publisherSlugs = new Set<string>();
const gameOwners = new Map<string, string>();
const plan: Array<{ publisher: SeedPublisher; publisherId: Hex; games: Array<{ game: SeedGame; gameId: Hex }> }> = [];

for (const publisher of seed.publishers) {
  if (!publisher.slug) throw new TypeError(`publisher ${publisher.name} is missing a slug`);
  if (publisherSlugs.has(publisher.slug)) {
    throw new TypeError(`duplicate publisher slug: ${publisher.slug}`);
  }
  publisherSlugs.add(publisher.slug);
  parseEther(publisher.minPublicOfferPriceEther); // throws if malformed

  const games = publisher.games.map((game) => {
    if (!game.slug) throw new TypeError(`game ${game.name} is missing a slug`);
    const previous = gameOwners.get(game.slug);
    if (previous && previous !== publisher.slug) {
      throw new TypeError(`game ${game.slug} assigned to two publishers (${previous}, ${publisher.slug})`);
    }
    gameOwners.set(game.slug, publisher.slug);
    return { game, gameId: gameIdFromSlug(game.slug) };
  });

  plan.push({ publisher, publisherId: publisherIdFromSlug(publisher.slug), games });
}

process.stdout.write(`PoPLY publisher allowlist seed — ${plan.length} publishers, ${gameOwners.size} games\n`);
for (const entry of plan) {
  process.stdout.write(
    `\n${entry.publisher.name} [${entry.publisher.slug}]\n` +
      `  publisherId: ${entry.publisherId}\n` +
      `  openLicensing: ${entry.publisher.openLicensing}  minPublicOfferPrice: ${entry.publisher.minPublicOfferPriceEther} ETH\n`,
  );
  for (const { game, gameId } of entry.games) {
    process.stdout.write(`  game ${game.name} [${game.slug}] -> ${gameId}\n`);
  }
}

if (!broadcast) {
  process.stdout.write(
    "\nDry run (no transactions sent). Re-run with --broadcast and the env below to apply:\n" +
      "  POPLY_RPC_URL, POPLY_CHAIN_ID, POPLY_VERIFIER_REGISTRY, POPLY_ADMIN_PRIVATE_KEY (registry owner)\n",
  );
} else {
  const rpcUrl = process.env.POPLY_RPC_URL;
  const registry = process.env.POPLY_VERIFIER_REGISTRY;
  const adminKey = process.env.POPLY_ADMIN_PRIVATE_KEY;
  const chainId = Number(process.env.POPLY_CHAIN_ID);
  if (!rpcUrl) throw new TypeError("POPLY_RPC_URL is required to broadcast");
  if (!registry || !isAddress(registry, { strict: true })) {
    throw new TypeError("POPLY_VERIFIER_REGISTRY must be an EVM address");
  }
  if (!adminKey || adminKey.length !== 66) {
    throw new TypeError("POPLY_ADMIN_PRIVATE_KEY must be a 32-byte hex private key");
  }
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new TypeError("POPLY_CHAIN_ID must be a positive chain id");
  }

  const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const transport = http(rpcUrl);
  const account = privateKeyToAccount(adminKey as Hex);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  async function send(hash: Promise<Hex>, label: string): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: await hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted`);
    process.stdout.write(`  ok: ${label}\n`);
  }

  for (const entry of plan) {
    process.stdout.write(`\nregistering ${entry.publisher.name}\n`);
    await send(
      registerPublisher(wallet, registry as Hex, {
        publisherId: entry.publisherId,
        openLicensing: entry.publisher.openLicensing,
        minPublicOfferPrice: parseEther(entry.publisher.minPublicOfferPriceEther),
      }),
      `registerPublisher(${entry.publisher.slug})`,
    );
    for (const { game, gameId } of entry.games) {
      await send(
        assignGame(wallet, registry as Hex, gameId, entry.publisherId),
        `assignGame(${game.slug})`,
      );
    }
  }
  process.stdout.write("\nSeed complete.\n");
}
