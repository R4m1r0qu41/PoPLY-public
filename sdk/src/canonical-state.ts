import { keccak256, stringToHex, type Hex } from "viem";

export type CanonicalValue =
  | null
  | boolean
  | string
  | number
  | bigint
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalJson(value: unknown): string {
  return encode(value, new Set<object>(), 0, { nodes: 0 });
}

export function stateCommitment(value: unknown): Hex {
  return keccak256(stringToHex(canonicalJson(value)));
}

/** Limits apply to SDK callers as well as HTTP callers; hashes of accepted values are unchanged. */
export function asCanonicalValue(value: unknown): CanonicalValue {
  canonicalJson(value);
  return value as CanonicalValue;
}

function encode(value: unknown, ancestors: Set<object>, depth: number, budget: { nodes: number }): string {
  if (depth > 32 || ++budget.nodes > 10_000) throw new RangeError("canonical state exceeds depth/node limits");
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") {
    // Render bigints as an unquoted decimal with a trailing "n" marker so the encoding is
    // injective across the CanonicalValue union: bigint 100n -> `100n` (unquoted) collides
    // with neither a number (100n vs 100, distinct token) nor a string ("100" or "100n",
    // both quoted). The unquoted trailing `n` is not producible by any other branch.
    return `${value.toString(10)}n`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError("canonical state numbers must be finite safe integers");
    }
    return JSON.stringify(value);
  }

  if (typeof value !== "object") throw new TypeError("unsupported canonical state value");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError("canonical state requires plain objects");
  }
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError("canonical state cannot contain symbol keys");
  if (ancestors.has(value)) throw new TypeError("canonical state cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError("canonical state requires dense arrays without extra keys");
      return `[${Array.from(value, (item) => encode(item, ancestors, depth + 1, budget)).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key], ancestors, depth + 1, budget)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
