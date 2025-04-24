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
    const speed = 1500;
    const radianAngle = Phaser.Math.DegToRad(angle); // Convert angle to radians
    const velocityX = Math.cos(radianAngle) * speed;
    const velocityY = Math.sin(radianAngle) * speed;

    this.body.reset(x, y);
    this.setAngle(angle - 270);
    this.setActive(true);
    this.setVisible(true);
    this.setVelocityX(velocityX);
    this.setVelocityY(velocityY);
    this.index = this.scene.bullets.get_all_bullets().length - 1; // Assign index
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
