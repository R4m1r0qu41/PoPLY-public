import { type Hex } from "viem";
import { stateCommitment } from "./canonical-state.ts";

export interface PoPLThreshold {
  level: number;
  minimumPlayTimeSeconds: bigint;
  minimumAchievements: number;
}

export const referencePolicy: readonly PoPLThreshold[] = [
  { level: 0, minimumPlayTimeSeconds: 0n, minimumAchievements: 0 },
  { level: 1, minimumPlayTimeSeconds: 3_600n, minimumAchievements: 0 },
  { level: 2, minimumPlayTimeSeconds: 18_000n, minimumAchievements: 1 },
  { level: 3, minimumPlayTimeSeconds: 72_000n, minimumAchievements: 3 },
  { level: 4, minimumPlayTimeSeconds: 180_000n, minimumAchievements: 5 },
  { level: 5, minimumPlayTimeSeconds: 360_000n, minimumAchievements: 10 },
] as const;

export function validatePolicy(policy: readonly PoPLThreshold[]): void {
  if (policy.length === 0 || policy[0]?.level !== 0) {
    throw new TypeError("policy must begin at level zero");
  }
  let previous: PoPLThreshold | undefined;
  for (const threshold of policy) {
    if (!Number.isInteger(threshold.level) || threshold.level < 0 || threshold.level > 65_535) {
      throw new RangeError("policy level must fit uint16");
    }
    if (
      threshold.minimumPlayTimeSeconds < 0n ||
      !Number.isInteger(threshold.minimumAchievements) ||
      threshold.minimumAchievements < 0
    ) {
      throw new RangeError("policy thresholds cannot be negative");
    }
    if (
      previous &&
      (threshold.level <= previous.level ||
        threshold.minimumPlayTimeSeconds < previous.minimumPlayTimeSeconds ||
        threshold.minimumAchievements < previous.minimumAchievements)
    ) {
      throw new RangeError("policy thresholds must be monotonic");
    }
    previous = threshold;
  }
}

export function calculatePoPL(
  playTimeSeconds: bigint,
  achievementCount: number,
  policy: readonly PoPLThreshold[] = referencePolicy,
): number {
  validatePolicy(policy);
  if (playTimeSeconds < 0n || !Number.isInteger(achievementCount) || achievementCount < 0) {
    throw new RangeError("activity values cannot be negative");
  }
  let level = 0;
  for (const threshold of policy) {
    if (
      playTimeSeconds >= threshold.minimumPlayTimeSeconds &&
      achievementCount >= threshold.minimumAchievements
    ) {
      level = threshold.level;
    }
  }
  return level;
}

export function policyId(policy: readonly PoPLThreshold[] = referencePolicy): Hex {
  validatePolicy(policy);
  const serializable = policy.map((threshold) => ({
    level: threshold.level,
    minimumAchievements: threshold.minimumAchievements,
    minimumPlayTimeSeconds: threshold.minimumPlayTimeSeconds,
  }));
  return stateCommitment(serializable);
}
