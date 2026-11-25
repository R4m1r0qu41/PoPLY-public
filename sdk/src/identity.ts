import { isAddress, type Address } from "viem";

export type CustodyMode = "publisher-managed" | "player-controlled";

export interface PlayerIdentity {
  publisherPlayerId: string;
  address: Address;
  custodyMode: CustodyMode;
  createdAt: bigint;
}

export interface IdentityResolver {
  resolve(publisherPlayerId: string): Promise<PlayerIdentity | undefined>;
}

/** Reference resolver only. It stores public identity mappings, never private keys. */
export class MemoryIdentityResolver implements IdentityResolver {
  private readonly identities = new Map<string, PlayerIdentity>();

  register(identity: PlayerIdentity): void {
    validateIdentity(identity);
    if (this.identities.has(identity.publisherPlayerId)) {
      throw new Error("publisher player identity already exists");
    }
    this.identities.set(identity.publisherPlayerId, { ...identity });
  }

  migrateToPlayerControl(publisherPlayerId: string, address: Address): void {
    if (!isAddress(address, { strict: true })) throw new TypeError("invalid player address");
    const current = this.identities.get(publisherPlayerId);
    if (!current) throw new Error("publisher player identity does not exist");
    if (current.custodyMode !== "publisher-managed") {
      throw new Error("identity is already player controlled");
    }
    this.identities.set(publisherPlayerId, {
      ...current,
      address,
      custodyMode: "player-controlled",
    });
  }

  async resolve(publisherPlayerId: string): Promise<PlayerIdentity | undefined> {
    const identity = this.identities.get(publisherPlayerId);
    return identity ? { ...identity } : undefined;
  }
}

function validateIdentity(identity: PlayerIdentity): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(identity.publisherPlayerId)) {
    throw new TypeError("publisherPlayerId must be a stable opaque identifier");
  }
  if (!isAddress(identity.address, { strict: true })) throw new TypeError("invalid player address");
  if (identity.createdAt < 0n) throw new RangeError("identity creation time cannot be negative");
}
