import Phaser from "phaser";
import Coin from "../assets/coin.svg";
import Spaceship from "../assets/spaceship.svg";
import BulletIcon from "../assets/bullet.svg";
import Bullets from "./Bullets";
import Explosion from "../assets/explosion.png";
import ExplosionSound from "../assets/exp.m4a";
import ShotSound from "../assets/shot.mp3";
import CoinSound from "../assets/coin_collect.wav";
import Constants from "../constants";
import io from "socket.io-client";
import background from "../assets/background.png";
import ClientPrediction from "./predictor";
class PlayGame extends Phaser.Scene {

  /* Initialize client connection to socket server*/
  init(name) {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "localhost:5000";
    } else {
      this.ENDPOINT = "localhost:5000";
    }
    console.log(this.ENDPOINT);

    this.name = name;
    this.keys = this.input.keyboard.createCursorKeys();
    this.space = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    this.score = 0;
    this.others = {}; //to store other players
    this.keystrokeState = "000000"; // Binary string for up, down, left, right, fire, collision
    this.othersKeystrokes = {}; // Map of other players' keystroke states
    this.x = Phaser.Math.Between(50, Constants.WIDTH - 50); // Use dynamic width
    this.y = Phaser.Math.Between(50, Constants.HEIGHT - 50); // Use dynamic height
  }

  /* Load assets */
  preload() {
    this.load.image('background', background);
    this.load.spritesheet("boom", Explosion, {
      frameWidth: 64,
      frameHeight: 64,
      endFrame: 23,
    });
    this.load.image("coin", Coin);
    this.load.image("ship", Spaceship);
    this.load.image("bullet", BulletIcon);
    this.load.audio("explosion", ExplosionSound);
    this.load.audio("shot", ShotSound);
    this.load.audio("coin", CoinSound);
  }


  create() {
    this.socket = io(this.ENDPOINT); 
    const background = this.add.image(Constants.WIDTH / 2, Constants.HEIGHT / 2, 'background');
    background.setDisplaySize(Constants.WIDTH+50, Constants.HEIGHT+50);
    background.setDepth(-1);
     this.socket = io(this.ENDPOINT);     
     this.socket.emit("update_screen_dimensions", {
      width: Constants.WIDTH,
      height: Constants.HEIGHT,
    });
    /* Create sounds and animations */
    var config = {
      key: "explode",
      frames: this.anims.generateFrameNumbers("boom", {
        start: 0,
        end: 23,
        first: 23,
      }),
      frameRate: 50,
    };
    this.explosion_sound = this.sound.add("explosion");
    this.shot_sound = this.sound.add("shot");
    this.coin_sound = this.sound.add("coin");
    this.anims.create(config);

    // Render client spaceship
    this.ship = this.get_new_spaceship(
      this.x,
      this.y,
      this.score,
      this.name,
      0
    ); 
   //connect to server.
    // Create bullet sprite-group
    this.bullets = new Bullets(this);

    /*
    This is recieved once for each new user, the user gets their id,
    and a map of all other user objects.
    */
    this.socket.on("to_new_user", (params, callback) => {
      this.id = params.id;
      this.others = params.others;
      /*
      Render the spaceships of all other users, and coin object.
      */
      for (const key of Object.keys(this.others)) {
        const x = this.others[key].x;
        const y = this.others[key].y;
        const score = this.others[key].score;
        const name = this.others[key].name;
        const angle = this.others[key].angle;
        const bullets = this.others[key].bullets;
        this.others[key].ship = this.get_new_spaceship(
          x,
          y,
          score,
          name,
          angle
        );
        this.others[key].bullets = this.get_enemy_bullets(bullets, key);
        this.others[key].score = score;
        this.others[key].name = name;
        this.check_for_winner(score);
      }
      // In create() or wherever you spawn the coin
this.coin = this.get_coin(
  Phaser.Math.Between(50, Constants.WIDTH - 50), // Use dynamic width
  Phaser.Math.Between(50, Constants.HEIGHT - 50) // Use dynamic height
);
      /*
      Update server with coordinates.
      */
      this.emit_coordinates();
    });

    /*
    Listen to server for updates on other users.
    */
    this.socket.on("to_others", (params, callback) => {
      const other_id = params.id;
      const other_x = params.x;
      const other_y = params.y;
      const score = params.score;
      const name = params.name;
      const angle = params.angle;
      const bullets = params.bullets;
      /*
      Either it's a new client, or an existing one with new info.
      */
      if (!(other_id in this.others)) {
        var ship = this.get_new_spaceship(other_x, other_y, score, name, angle);
        var others_bullets = this.get_enemy_bullets(bullets, other_id);
        this.others[other_id] = {
          x: other_x,
          y: other_y,
          ship: ship,
          bullets: others_bullets,
          score: score,
          name: name,
        };
      } else {
        this.others[other_id].ship.cont.x = other_x;
        this.others[other_id].ship.cont.y = other_y;
        this.others[other_id].ship.score_text.setText(`${name}: ${score}`);
        this.others[other_id].ship.ship.setAngle(angle);
        this.update_enemy_bullets(other_id, bullets);
        this.others[other_id].score = score;
        this.others[other_id].name = name;
      }
      this.check_for_winner(score);
    });

    /*
    Listen for changes in the coordinates of the coin.
    */
    this.socket.on("coin_changed", (params, callback) => {
      this.coin_sound.play();
      this.coin.x = params.coin.x;
      this.coin.y = params.coin.y;
    });

    /*
    Listen for other players being shot, to animate an explosion on their spaceship sprite.
    */
    this.socket.on("other_collision", (params, callback) => {
      const other_id = params.bullet_user_id;
      const bullet_index = params.bullet_index;
      const exploded_user_id = params.exploded_user_id;
      this.bullets.children.entries[bullet_index].setVisible(false);
      this.bullets.children.entries[bullet_index].setActive(false);
      this.animate_explosion(exploded_user_id);
    });

    /*
    Play a shot sound whenever another player shoots a bullet.
    */
    this.socket.on("other_shot", (p, c) => this.shot_sound.play());

    /*
    Listen for disconnections of others.
    */
    this.socket.on("user_disconnected", (params, callback) => {
      this.others[params.id].ship.score_text.destroy();
      this.others[params.id].ship.ship.destroy();
      this.others[params.id].ship.cont.destroy();
      delete this.others[params.id];
    });

    // Listen for keystroke updates from the server
    this.socket.on("keystroke_update", ({ id, state }) => {
      this.othersKeystrokes[id] = state;
    });
  }

  /*
  Poll for arrow keys to move the spaceship.
  */
  update() {
    const delta = this.game.loop.delta; // Time delta for consistent movement
    const keys = this.keys;
    let newState = "000000"; // Add a new state for bullet collision

    // Update keystroke state based on key presses
    if (keys.up.isDown) newState = newState.substring(0, 0) + "1" + newState.substring(1);
    if (keys.down.isDown) newState = newState.substring(0, 1) + "1" + newState.substring(2);
    if (keys.left.isDown) newState = newState.substring(0, 2) + "1" + newState.substring(3);
    if (keys.right.isDown) newState = newState.substring(0, 3) + "1" + newState.substring(4);
    if (Phaser.Input.Keyboard.JustDown(this.space)) newState = newState.substring(0, 4) + "1";
    if (Phaser.Input.Keyboard.JustUp(this.space)) newState = newState.substring(0, 4) + "0";
    if (Phaser.Input.Keyboard.JustUp(keys.up)) newState = newState.substring(0, 0) + "0" + newState.substring(1);
    if (Phaser.Input.Keyboard.JustUp(keys.down)) newState = newState.substring(0, 1) + "0" + newState.substring(2);
    if (Phaser.Input.Keyboard.JustUp(keys.left)) newState = newState.substring(0, 2) + "0" + newState.substring(3);
    if (Phaser.Input.Keyboard.JustUp(keys.right)) newState = newState.substring(0, 3) + "0" + newState.substring(4);

    // Emit shot event if space is pressed
    if (newState[4] === "1") {
        this.shot_sound.play();
        this.bullets.fireBullet(
            this.ship.cont.x,
            this.ship.cont.y,
            this.ship.ship.angle - 90,
            () => {}
        );
        this.socket.emit("shot", { x: this.ship.cont.x, y: this.ship.cont.y });
    }

    // Emit keystroke state if it has changed
    if (newState !== this.keystrokeState) {
        this.keystrokeState = newState;
        this.socket.emit("keystroke_state", newState);
    }

    // Update local player position based on keystroke state
    this.updatePlayerPosition(this.keystrokeState, this.ship, delta);

    // Update other players' positions based on their keystroke states
    for (const id in this.othersKeystrokes) {
        this.updatePlayerPosition(this.othersKeystrokes[id], this.others[id].ship, delta);
    }

    // Check for bullet collisions with other players
    this.checkBulletCollisions();

    this.emit_coordinates();
  }

  checkBulletCollisions() {
    this.bullets.children.each((bullet) => {
        if (bullet.active) {
            for (const id in this.others) {
                const other = this.others[id];
                if (Phaser.Geom.Intersects.RectangleToRectangle(bullet.getBounds(), other.ship.cont.getBounds())) {
                    bullet.set_bullet(false);
                    this.socket.emit("collision", { bullet_user_id: this.id, bullet_index: bullet.index, target_id: id });
                    this.animate_explosion(id);
                    other.score = Math.max(0, other.score - 2); // Reduce score
                    other.ship.score_text.setText(`${other.name}: ${other.score}`);
                }
            }
        }
    });
  }

  updatePlayerPosition(state, ship, delta) {
    const speed = 800; // Base speed in pixels per second
    let dx = 0;
    let dy = 0;

    // Determine movement direction
    if (state[0] === "1") dy -= 1; // Up
    if (state[1] === "1") dy += 1; // Down
    if (state[2] === "1") dx -= 1; // Left
    if (state[3] === "1") dx += 1; // Right

    // Normalize diagonal movement
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 0) {
        dx /= magnitude;
        dy /= magnitude;
    }

    // Set angle based on movement direction
    if (dx !== 0 || dy !== 0) {
        const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        ship.ship.setAngle(angle + 90); // Adjust angle to match sprite orientation
    }

    // Apply movement with time delta factor
    ship.cont.x += dx * speed * (delta / 1000);
    ship.cont.y += dy * speed * (delta / 1000);
  }

  /*
  Get a new game object consisting of:
  spaceship sprite, name and score.
  */
  get_new_spaceship = (x, y, score, name, angle) => {
    var randomColor = Phaser.Display.Color.RandomRGB()._color; // Generate a random color
    var score_text = this.add.text(-30, 25, `${name}: ${score}`, {
      color: randomColor,
      align: "center",
      fontSize: "13px",
    });
    var ship = this.add.sprite(0, 0, "ship");
    ship.setAngle(angle);
    var cont = this.add.container(x, y, [ship, score_text]);
    cont.setSize(45, 45);
    this.physics.add.existing(cont, false);
    this.physics.add.existing(ship, false);
    cont.body.setCollideWorldBounds(true);
    return { score_text, ship, cont };
  };

  /*
  Upon movement, inform the server of new coordinates.
  */
  emit_coordinates = () => {
    this.socket.emit("update_coordinates", {
      x: this.ship.cont.x,
      y: this.ship.cont.y,
      score: this.score,
      name: this.name,
      angle: this.ship.ship.angle,
      bullets: this.bullets.get_all_bullets(this.socket.id),
    });
  };

  /*
  Create coin object , and initiate a collider between the coin
  and the clients ship.
  */
  get_coin = (x, y) => {
    var coin = this.add.sprite(x, y, "coin");
    this.physics.add.existing(coin, false);
    this.physics.add.collider(coin, this.ship.ship, this.fire, null, this);
    return coin;
  };

  /*
  When a player overlaps with the coin,
  the others are notified of its new position
  by this callback.
  */
  fire = (coin) => {
    this.coin_sound.play();
    coin.x = Phaser.Math.Between(20, Constants.WIDTH - 20);
    coin.y = Phaser.Math.Between(20, Constants.HEIGHT - 20);
    this.score += 5;
    this.ship.score_text.setText(`${this.name}: ${this.score}`);
    this.socket.emit("update_coin", {
      x: coin.x,
      y: coin.y,
    });
    this.check_for_winner(this.score);
  };

  /*
  Create bullet objects for enemies (for new enemies or new clients), then create a collider callback
  in case any of the bullets ever hits the client.
  */
  get_enemy_bullets = (bullets, id) => {
    var enemy_bullets = new Bullets(this);
    for (let i = 0; i < bullets.length; i++) {
      enemy_bullets.children.entries[i].setAngle(bullets[i].angle);
      enemy_bullets.children.entries[i].setActive(bullets[i].active);
      enemy_bullets.children.entries[i].setVisible(bullets[i].visible);
      enemy_bullets.children.entries[i].x = bullets[i].x;
      enemy_bullets.children.entries[i].y = bullets[i].y;
      this.physics.add.collider(
        enemy_bullets.children.entries[i],
        this.ship.ship,
        (bullet) => {
          if (!bullet.disabled) {
            this.emmit_collision(id, i);
            bullet.disabled = true;
            enemy_bullets.children.entries[i].setActive(false)
            this.animate_explosion("0");
          } else {
            setTimeout(() => {
              bullet.disabled = false;
            }, 100);
          }
        },
        null,
        this
      );
    }
    return enemy_bullets;
  };

  /*
  Update all the sprites of the enemy bullets based on enemy updates read by socket.
  */
  update_enemy_bullets = (id, bullets) => {
    var bullet_sprites = this.others[id].bullets;
    for (var i = 0; i < bullets.length; i++) {
      bullet_sprites.children.entries[i].x = bullets[i].x;
      bullet_sprites.children.entries[i].y = bullets[i].y;
      bullet_sprites.children.entries[i].setAngle(bullets[i].angle);
      bullet_sprites.children.entries[i].setActive(bullets[i].active);
      bullet_sprites.children.entries[i].setVisible(bullets[i].visible);
    }
  };

  /*
  The client here emits to all the other players that they have been hit by a bullet.
  */
  emmit_collision = (bullet_user_id, bullet_index) => {
    this.socket.emit("collision", { bullet_user_id, bullet_index });
  };

  /*
  Animate the explosion of the player that got hit (checks if player is the client or another).
  The player that gets shot is disabled for 1 sec.
  */
  animate_explosion = (id) => {
    var ship;
    if (id === "0") {
      ship = this.ship.cont;
      ship.setActive(false);
      this.score = Math.max(0, this.score - 2);
      this.ship.score_text.setText(`${this.name}: ${this.score}`);
      setTimeout(() => {
        ship.setActive(true);
      }, 1000);
    } else {
      ship = this.others[id].ship.cont;
    }
    var boom = this.add.sprite(ship.x, ship.y, "boom");
    boom.anims.play("explode");
    this.explosion_sound.play();
  };

  /*
  If any player exceeds 100 points , the game is over and the scoreboard is shown.
  */
  check_for_winner = (score) => {
    if (score >= Constants.POINTS_TO_WIN) {
      let players = [{ name: this.name, score: this.score }];
      for (let other in this.others) {
        players.push({
          name: this.others[other].name,
          score: this.others[other].score,
        });
      }
      players = players.sort((a, b) => b.score - a.score);
      setTimeout(() => this.socket.disconnect(), 20);
      this.scene.start("winner", players);
    }
  };
}

export default PlayGame;
