import type { ArenaState } from "../game/simulation/arena.ts";
import type { ProofRequestBundle } from "../integration/match-proof.ts";

export function connectHud(): void {
  const playerHealth = element("player-health");
  const enemyHealth = element("enemy-health");
  const status = element("round-status");
  const timer = element("timer");
  const startCard = element("start-card");
  const startButton = element("start-button");
  const proofLog = element("proof-log");

  startButton.addEventListener("click", () => window.dispatchEvent(new Event("poply:start")));
  window.addEventListener("poply:started", () => startCard.classList.add("start-card--hidden"));
  window.addEventListener("poply:state", ((event: CustomEvent<ArenaState>) => {
    const state = event.detail;
    playerHealth.style.width = `${state.player.health}%`;
    enemyHealth.style.width = `${state.enemy.health}%`;
    timer.textContent = formatTime(state.elapsedMs);
    status.textContent = `${state.phase.toUpperCase()} // ROUND 01`;
    document.body.dataset.phase = state.phase;
    if (state.phase === "defeat") {
      startCard.classList.remove("start-card--hidden");
      startCard.querySelector("h1")!.innerHTML = "Signal lost.<br /><em>Run it again.</em>";
      startButton.querySelector("span")!.textContent = "RESTART MATCH";
    }
  }) as EventListener);
  window.addEventListener("poply:proof", ((event: CustomEvent<ProofRequestBundle>) => {
    void event.detail;
    proofLog.innerHTML = `<li class="verified"><i></i>Match completed off-chain</li><li class="verified"><i></i>PoP checkpoint payload canonicalized</li><li class="verified"><i></i>PoA FIRST_WIN prepared</li><li><i></i>Publisher signature boundary ready</li>`;
    element("chain-writes").textContent = "0";
    element("proof-panel").classList.add("proof-panel--active");
  }) as EventListener);
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing UI element #${id}`);
  return found;
}

function formatTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000).toString().padStart(2, "0");
  const seconds = Math.floor((milliseconds % 60_000) / 1_000).toString().padStart(2, "0");
  const tenths = Math.floor((milliseconds % 1_000) / 100);
  return `${minutes}:${seconds}.${tenths}`;
}
