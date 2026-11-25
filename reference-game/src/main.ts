import Phaser from "phaser";
import { BattleScene } from "./phaser/scenes/BattleScene.ts";
import { connectHud } from "./ui/hud.ts";
import "./style.css";

connectHud();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "playfield",
  backgroundColor: "#07110f",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, pixelArt: false },
  scene: [BattleScene],
  banner: false,
});
