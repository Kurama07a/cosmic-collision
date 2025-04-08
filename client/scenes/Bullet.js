/*
A bullet class to represent the bullet sprite and its main functionalities 
*/

import Phaser from "phaser";
import Constants from "../constants";
export default class Bullet extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, "bullet");
  }

  fire(x, y, angle) {
    const speed = 1000;
    const radianAngle = Phaser.Math.DegToRad(angle);
    const velocityX = Math.cos(radianAngle) * speed;
    const velocityY = Math.sin(radianAngle) * speed;

    this.body.reset(x, y);
    this.setAngle(angle);
    this.setActive(true);
    this.setVisible(true);
    this.setVelocity(velocityX, velocityY);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (
      this.y <= -10 ||
      this.y >= Constants.HEIGHT + 10 ||
      this.x <= -10 ||
      this.x >= Constants.WIDTH + 10
    ) {
      this.set_bullet(false);
    }
  }

  set_bullet(status) {
    this.setActive(status);
    this.setVisible(status);
  }
}
