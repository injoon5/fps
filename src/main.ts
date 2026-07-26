import "./style.css";
import { FallRushGame } from "./game/FallRushGame";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("Missing #game-canvas");

const game = new FallRushGame(canvas);
void game.init();

window.addEventListener("beforeunload", () => {
  game.dispose();
});
