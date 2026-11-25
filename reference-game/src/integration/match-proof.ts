import type { Hex } from "viem";
import type { ArenaState } from "../game/simulation/arena.ts";

export const REFERENCE_GAME_ID = "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393" as const;
export const DEMO_CHARACTER_CONTRACT = "0x1000000000000000000000000000000000000001" as const;

export interface ProofRequestBundle {
  checkpoint: {
    characterContract: typeof DEMO_CHARACTER_CONTRACT;
    tokenId: string;
    gameId: Hex;
    sequence: string;
    state: Record<string, string | number>;
    playTimeSeconds: string;
    achievementCount: number;
  };
  achievement: {
    characterContract: typeof DEMO_CHARACTER_CONTRACT;
    tokenId: string;
    gameId: Hex;
    achievement: "FIRST_WIN";
    evidence: Record<string, string | number>;
  };
}

export function buildProofRequests(state: ArenaState, sequence = 1n): ProofRequestBundle {
  if (state.phase !== "victory") throw new TypeError("only a completed victory can produce proof requests");
  const playTimeSeconds = BigInt(Math.max(1, Math.ceil(state.elapsedMs / 1_000)));
  return {
    checkpoint: {
      characterContract: DEMO_CHARACTER_CONTRACT,
      tokenId: "1",
      gameId: REFERENCE_GAME_ID,
      sequence: sequence.toString(10),
      state: { arena: "reference-01", result: "victory", elapsedMs: Math.round(state.elapsedMs), remainingHealth: state.player.health },
      playTimeSeconds: playTimeSeconds.toString(10),
      achievementCount: 1,
    },
    achievement: {
      characterContract: DEMO_CHARACTER_CONTRACT,
      tokenId: "1",
      gameId: REFERENCE_GAME_ID,
      achievement: "FIRST_WIN",
      evidence: { arena: "reference-01", elapsedMs: Math.round(state.elapsedMs), remainingHealth: state.player.health, opponent: "warden" },
    },
  };
}

export function publishProofPreview(bundle: ProofRequestBundle): void {
  window.dispatchEvent(new CustomEvent("poply:proof", { detail: bundle }));
}
