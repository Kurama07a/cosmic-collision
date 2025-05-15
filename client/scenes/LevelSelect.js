import Phaser from "phaser";
import Constants from "../constants";
import starsBackground from "../assets/stars.png";

export default class LevelSelect extends Phaser.Scene {
  init(playerName) {
    this.playerName = playerName;
    this.selected = 0;
    this.levels = [
      { name: "Classic", key: "classic" },
      { name: "Blackhole", key: "blackhole" }
    ];
  }

  preload() {
    this.load.image('stars', starsBackground);
  }

  create() {
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'stars')
      .setOrigin(0)
      .setDepth(-1);

    this.add.text(Constants.WIDTH/2, 120, "SELECT LEVEL", {
      fontFamily: 'Arial Black',
      fontSize: '48px',
      color: '#FFE81F'
    }).setOrigin(0.5);

    this.options = [];
    for (let i = 0; i < this.levels.length; i++) {
      const opt = this.add.text(Constants.WIDTH/2, 220 + i*80, this.levels[i].name, {
        fontFamily: 'Arial',
        fontSize: '36px',
        color: i === this.selected ? '#00FF00' : '#FFFFFF'
      }).setOrigin(0.5);
      this.options.push(opt);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  update() {
    // Animate starfield
    this.starfield.tilePositionY -= 0.5;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.selected = (this.selected + 1) % this.levels.length;
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.selected = (this.selected - 1 + this.levels.length) % this.levels.length;
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.enter)) {
      this.scene.start("roomselection", { playerName: this.playerName, level: this.levels[this.selected].key });
    }
  }

  refresh() {
    for (let i = 0; i < this.options.length; i++) {
      this.options[i].setColor(i === this.selected ? '#00FF00' : '#FFFFFF');
    }
  }
}
