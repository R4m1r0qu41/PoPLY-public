import Phaser from "phaser";
import { createArenaState, startArena, stepArena, type ArenaState } from "../../game/simulation/arena.ts";
import { buildProofRequests, publishProofPreview } from "../../integration/match-proof.ts";

const FIXED_MS = 16;
// Cap catch-up sub-steps per frame so a long stall (tab backgrounded, GC pause) cannot trigger a
// "spiral of death" where each frame tries to simulate more time than it can afford.
const MAX_SUBSTEPS = 5;

export class BattleScene extends Phaser.Scene {
  private state: ArenaState = createArenaState();
  private stepAccumulatorMs = 0;
  private player!: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Graphics;
  private cursors!: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; attack: Phaser.Input.Keyboard.Key };
  private proofPublished = false;

  constructor() {
    super("battle");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#07110f");
    this.ground = this.add.graphics();
    this.drawArena();
    this.player = this.add.rectangle(0, 0, 58, 112, 0xd9ff4b).setOrigin(0.5, 1);
    this.player.setStrokeStyle(2, 0xf4ffd0, 0.8);
    const enemyBody = this.add.rectangle(0, 0, 72, 124, 0xe65332).setOrigin(0.5, 1);
    enemyBody.setStrokeStyle(2, 0xffa48d, 0.8);
    const enemyCore = this.add.circle(0, -75, 10, 0xffd166);
    this.enemy = this.add.container(0, 0, [enemyBody, enemyCore]);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("keyboard input is unavailable");
    this.cursors = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
    window.addEventListener("poply:start", this.startMatch);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.drawArena, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("poply:start", this.startMatch);
    });
    this.syncView();
  }

  update(_time: number, delta: number): void {
    // Sample input once per frame and reuse it for every fixed sub-step so the simulation is
    // frame-rate independent and the signed PoP state stays reproducible.
    const input = {
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      attack: this.cursors.attack.isDown,
    };

    this.stepAccumulatorMs += delta;
    // Clamp the backlog before draining so we never run more than MAX_SUBSTEPS steps this frame.
    this.stepAccumulatorMs = Math.min(this.stepAccumulatorMs, FIXED_MS * MAX_SUBSTEPS);

    const events: typeof this.state.events = [];
    while (this.stepAccumulatorMs >= FIXED_MS) {
      this.state = stepArena(this.state, input, FIXED_MS);
      this.stepAccumulatorMs -= FIXED_MS;
      events.push(...this.state.events);
    }

    for (const event of events) {
      if (event === "enemy-hit") this.hitEffect(this.enemy.x, this.enemy.y - 58, 0xd9ff4b);
      if (event === "player-hit") this.hitEffect(this.player.x, this.player.y - 58, 0xe65332);
    }
    if (this.state.phase === "victory" && !this.proofPublished) {
      this.proofPublished = true;
      publishProofPreview(buildProofRequests(this.state));
    }
    this.syncView();
  }

  private readonly startMatch = (): void => {
    this.state = startArena(this.state);
    this.proofPublished = false;
    window.dispatchEvent(new CustomEvent("poply:started"));
  };

  private syncView(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const arenaWidth = Math.min(width, 1_400);
    const left = (width - arenaWidth) / 2;
    const baseline = height * 0.77;
    this.player.setPosition(left + (this.state.player.x / 1_000) * arenaWidth, baseline);
    this.enemy.setPosition(left + (this.state.enemy.x / 1_000) * arenaWidth, baseline);
    window.dispatchEvent(new CustomEvent("poply:state", { detail: this.state }));
  }

  private drawArena(): void {
    if (!this.ground) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const baseline = height * 0.77;
    this.ground.clear();
    this.ground.lineStyle(1, 0x35534a, 0.28);
    for (let x = 0; x < width; x += 64) this.ground.lineBetween(x, baseline, width / 2, height);
    for (let y = baseline; y < height; y += 34) this.ground.lineBetween(0, y, width, y);
    this.ground.lineStyle(2, 0xd9ff4b, 0.35).lineBetween(0, baseline, width, baseline);
  }

  private hitEffect(x: number, y: number, color: number): void {
    const flash = this.add.circle(x, y, 8, color, 0.9);
    this.tweens.add({ targets: flash, radius: 42, alpha: 0, duration: 180, ease: "Quad.Out", onComplete: () => flash.destroy() });
    this.cameras.main.shake(70, 0.0025);
  }
}
