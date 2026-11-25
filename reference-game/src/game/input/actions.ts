export interface ArenaInput {
  left: boolean;
  right: boolean;
  attack: boolean;
}

export const idleInput: ArenaInput = { left: false, right: false, attack: false };
