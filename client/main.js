import Phaser from 'phaser';
import PlayGame from "./scenes/PlayGame";
import Welcome from "./scenes/Welcome";
import Winner from "./scenes/Winner";
import Constants from "./constants";

const config = {
  type: Phaser.AUTO,
  width: Constants.WIDTH,  // Dynamic width
  height: Constants.HEIGHT, // Dynamic height
  physics: { default: "arcade" },
  backgroundColor: "#202830",
};

const game = new Phaser.Game(config);

game.scene.add("playgame", PlayGame);
game.scene.add("welcome", Welcome);
game.scene.add("winner", Winner);
game.scene.start("welcome");
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});