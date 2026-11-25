import type { ArenaInput } from "../input/actions.ts";

export type ArenaPhase = "ready" | "running" | "victory" | "defeat";
export type ArenaEvent = "player-hit" | "enemy-hit" | "victory" | "defeat";

export interface FighterState {
  x: number;
  health: number;
  maxHealth: number;
  cooldownMs: number;
}

export interface ArenaState {
  phase: ArenaPhase;
  elapsedMs: number;
  player: FighterState;
  enemy: FighterState;
  events: ArenaEvent[];
}

const PLAYER_SPEED = 0.34;
const ENEMY_SPEED = 0.17;
const ATTACK_RANGE = 116;
const PLAYER_DAMAGE = 17;
const ENEMY_DAMAGE = 9;
const PLAYER_COOLDOWN = 430;
const ENEMY_COOLDOWN = 880;
const LEFT_BOUND = 90;
const RIGHT_BOUND = 910;

export function createArenaState(): ArenaState {
  return {
    phase: "ready",
    elapsedMs: 0,
    player: { x: 245, health: 100, maxHealth: 100, cooldownMs: 0 },
    enemy: { x: 755, health: 100, maxHealth: 100, cooldownMs: 700 },
    events: [],
  };
}

export function startArena(state: ArenaState): ArenaState {
  if (state.phase === "running") return state;
  return { ...createArenaState(), phase: "running" };
}

export function stepArena(state: ArenaState, input: ArenaInput, deltaMs: number): ArenaState {
  if (state.phase !== "running") return { ...state, events: [] };
  const dt = Math.min(Math.max(deltaMs, 0), 50);
  const player = { ...state.player, cooldownMs: Math.max(0, state.player.cooldownMs - dt) };
  const enemy = { ...state.enemy, cooldownMs: Math.max(0, state.enemy.cooldownMs - dt) };
  const events: ArenaEvent[] = [];
  const direction = Number(input.right) - Number(input.left);
  player.x = clamp(player.x + direction * PLAYER_SPEED * dt, LEFT_BOUND, RIGHT_BOUND);

  if (Math.abs(enemy.x - player.x) > ATTACK_RANGE * 0.76) {
    enemy.x = clamp(enemy.x + Math.sign(player.x - enemy.x) * ENEMY_SPEED * dt, LEFT_BOUND, RIGHT_BOUND);
  }
  if (input.attack && player.cooldownMs === 0 && Math.abs(enemy.x - player.x) <= ATTACK_RANGE) {
    enemy.health = Math.max(0, enemy.health - PLAYER_DAMAGE);
    player.cooldownMs = PLAYER_COOLDOWN;
    enemy.x = clamp(enemy.x + Math.sign(enemy.x - player.x) * 18, LEFT_BOUND, RIGHT_BOUND);
    events.push("enemy-hit");
  }
  if (enemy.health === 0) {
    events.push("victory");
    return { phase: "victory", elapsedMs: state.elapsedMs + dt, player, enemy, events };
  }
  if (enemy.cooldownMs === 0 && Math.abs(enemy.x - player.x) <= ATTACK_RANGE * 0.82) {
    player.health = Math.max(0, player.health - ENEMY_DAMAGE);
    enemy.cooldownMs = ENEMY_COOLDOWN;
    player.x = clamp(player.x + Math.sign(player.x - enemy.x) * 12, LEFT_BOUND, RIGHT_BOUND);
    events.push("player-hit");
  }
  if (player.health === 0) {
    events.push("defeat");
    return { phase: "defeat", elapsedMs: state.elapsedMs + dt, player, enemy, events };
  }
  return { phase: "running", elapsedMs: state.elapsedMs + dt, player, enemy, events };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
