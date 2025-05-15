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
import starsBackground from "../assets/Space.png";
import BlackholeImg from "../assets/bh.png";
import ClientPrediction from "./predictor";

class PlayGame extends Phaser.Scene {
  /* Initialize client connection to socket server */
  init(params) {
    // Check if params is a string (for backward compatibility) or object
    if (typeof params === 'string') {
      this.name = params;
      this.roomId = "main";
      this.roomName = "Free-For-All";
      this.level = "classic";
    } else {
      this.name = params.playerName;
      this.roomId = params.roomId;
      this.roomName = params.roomName;
      this.level = params.level || "classic";
    }

    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "localhost:5000";
    } else {
      this.ENDPOINT = "localhost:5000";
    }

    this.keys = this.input.keyboard.createCursorKeys();
    this.space = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    this.score = 0;
    this.others = {}; // to store other players
    this.keystrokeState = "000000"; // Binary string for up, down, left, right, fire, collision
    this.othersKeystrokes = {}; // Map of other players' keystroke states
    this.x = Phaser.Math.Between(50, Constants.WIDTH - 50);
    this.y = Phaser.Math.Between(50, Constants.HEIGHT - 50);

    // For fly controls
    this.thrust = 0.95;
    this.rotationSpeed = 0;
    this.powerupState = { speed: false, multi: false, attract: false };
    this.powerupTimer = {};
    this.activePowerups = [];
    this.powerupBarGraphics = null;

    // Blackhole level properties
    this.blackholeMass = 10000;
    this.shipMass = 10;
    this.G = 3000; // Gravitational constant for gameplay feel
    this.respawning = false;
    this.respawnTarget = null;
    this.respawnLerpT = 0;

    // Use existing socket if available (from room selection)
    this.socket = window.gameSocket || null;
  }

  preload() {
    this.load.image('background', background); // Ensure this path is correct
    this.load.image('space', starsBackground); // Add the same background as Welcome
    this.load.spritesheet("boom", Explosion, {
      frameWidth: 64,
      frameHeight: 64,
      endFrame: 23,
    });
    this.load.image("coin", Coin);
    this.load.image("ship", Spaceship);
    this.load.image("bullet", BulletIcon);
    this.load.image('blackhole', BlackholeImg);
    this.load.audio("explosion", ExplosionSound);
    this.load.audio("shot", ShotSound);
    this.load.audio("coin", CoinSound);
  }

  create() {
    // If no socket exists (direct game start), create one
    if (!this.socket) {
      this.socket = io(this.ENDPOINT);
    }

    // Add room info display
    this.createRoomInfoDisplay();

    const background = this.add.image(Constants.WIDTH / 2, Constants.HEIGHT / 2, 'background');
    background.setDisplaySize(Constants.WIDTH+50, Constants.HEIGHT+50);
    background.setDepth(-1);
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'space')
        .setOrigin(0)
        .setDepth(-1);

    // Send screen dimensions to server
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

    // Create bullet sprite-group
    this.bullets = new Bullets(this);

    // Blackhole level setup
    if (this.level === "blackhole") {
      this.initBlackholeLevel();
    }

    // Join room or get initialized in current room
    if (this.roomId) {
      // If coming from room selection, we're already in the room
      // Just initialize the game state
      this.socket.emit("initialize_game");
    } else {
      // Legacy path - join main room
      this.socket.emit("join_room", { roomId: "main", name: this.name }, (response) => {
        if (response.success) {
          this.roomId = response.roomId;
          this.roomName = response.roomName;
          this.updateRoomInfoDisplay();
          this.socket.emit("initialize_game");
        }
      });
    }

    /*
    This is received once for each new user, the user gets their id,
    and a map of all other user objects.
    */
    this.socket.on("to_new_user", (params, callback) => {
      this.id = params.id;
      this.others = {};  // Initialize empty others object first
      
      console.log("Coin position received from server:", params.coin);
      
      // Use the coin position received from the server
      this.coin = this.get_coin(params.coin.x, params.coin.y);
      
      // Process other players received from the server
      for (const key of Object.keys(params.others)) {
        // Skip self - this prevents creating a duplicate of your own ship
        if (key === this.id) continue;
        
        const other = params.others[key];
        const x = other.x;
        const y = other.y;
        const score = other.score;
        const name = other.name;
        const angle = other.angle;
        const bullets = other.bullets || [];
        
        // Create ship for other player
        this.others[key] = {
          x: x,
          y: y,
          ship: this.get_new_spaceship(x, y, score, name, angle),
          bullets: this.get_enemy_bullets(bullets, key),
          score: score,
          name: name,
        };
        this.check_for_winner(score);
      }

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

    // Handle disconnect and reconnect
    this.socket.on("disconnect", () => {
      this.showDisconnectedMessage();
    });

    // Add a back button to return to room selection
    this.backButton = this.add.text(
      50, 50, "< BACK", {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#AAAAAA',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
      }
    ).setInteractive().on('pointerdown', () => {
      this.leaveRoom();
    });

    // Listen for resize events
    this.scale.on('resize', this.resize, this);
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

    if (this.level === "blackhole") {
      this.updateBlackholeLevel(delta);
    } else {
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
    }

    this.emit_coordinates();
  }

  initBlackholeLevel() {
    // Blackhole in center
    this.blackhole = this.add.sprite(Constants.WIDTH/2, Constants.HEIGHT/2, "blackhole").setScale(0.5).setDepth(2);
    this.physics.add.existing(this.blackhole, false);
    this.blackhole.body.setCircle(this.blackhole.width/2 * 0.5);

    // Powerup group
    this.powerups = this.physics.add.group();
    this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => this.spawnPowerup()
    });

    // Attract coin effect
    this.attractRadius = 200;

    // Powerup bar graphics
    this.powerupBarGraphics = this.add.graphics().setDepth(10);

    // Blackhole physics: add velocity for the ship
    this.shipVelocity = { x: 0, y: 0 };
  }

  updateBlackholeLevel(delta) {
    const dt = delta / 1000;
    const keys = this.keys;
    let ship = this.ship;
    // --- Increased speed ---
    let speed = this.powerupState.speed ? 1700 : 1200; // was 1200/800
    let rotSpeed = 270; // was 220

    // --- Respawn logic ---
    if (this.respawning) {
      this.respawnLerpT += delta / 800;
      ship.cont.x = Phaser.Math.Interpolation.Linear([ship.cont.x, this.respawnTarget.x], this.respawnLerpT);
      ship.cont.y = Phaser.Math.Interpolation.Linear([ship.cont.y, this.respawnTarget.y], this.respawnLerpT);
      if (this.respawnLerpT >= 1) {
        this.respawning = false;
        this.respawnLerpT = 0;
        ship.ship.setVisible(true);
        if (ship.cont.setVisible) ship.cont.setVisible(true);
        // Reset velocity after respawn
        this.shipVelocity.x = 0;
        this.shipVelocity.y = 0;
      }
      this.drawPowerupBar();
      this.emit_coordinates();
      return;
    }

    // --- Fly controls: up = thrust, left/right = rotate ---
    if (keys.left.isDown) {
      ship.ship.angle -= rotSpeed * dt;
    }
    if (keys.right.isDown) {
      ship.ship.angle += rotSpeed * dt;
    }
    // Thrust applies acceleration in facing direction
    if (keys.up.isDown) {
      const angleRad = Phaser.Math.DegToRad(ship.ship.angle - 90);
      this.shipVelocity.x += Math.cos(angleRad) * (speed * 0.7) * dt / this.shipMass;
      this.shipVelocity.y += Math.sin(angleRad) * (speed * 0.7) * dt / this.shipMass;
    }

    // --- Blackhole gravity (constant for whole screen, increases as you get closer) ---
    if (this.blackhole) {
      const dx = this.blackhole.x - ship.cont.x;
      const dy = this.blackhole.y - ship.cont.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      // No influence radius: always acts
      // F = G * m1 * m2 / r^2, acceleration = F / m1
      const force = this.G * this.shipMass * this.blackholeMass / (dist * dist);
      const ax = (dx / dist) * force / this.shipMass;
      const ay = (dy / dist) * force / this.shipMass;
      this.shipVelocity.x += ax * dt;
      this.shipVelocity.y += ay * dt;
      // If too close, respawn at edge and lerp
      if (dist < 40 && !this.respawning) {
        ship.ship.setVisible(false);
        for (let type of Object.keys(this.powerupState)) {
          this.powerupState[type] = false;
          if (this.powerupTimer[type]) {
            this.powerupTimer[type].remove();
            this.powerupTimer[type] = null;
          }
        }
        let edge = Phaser.Math.Between(0, 3);
        let rx, ry;
        if (edge === 0) { rx = 10; ry = Phaser.Math.Between(10, Constants.HEIGHT-10); }
        else if (edge === 1) { rx = Constants.WIDTH-10; ry = Phaser.Math.Between(10, Constants.HEIGHT-10); }
        else if (edge === 2) { rx = Phaser.Math.Between(10, Constants.WIDTH-10); ry = 10; }
        else { rx = Phaser.Math.Between(10, Constants.WIDTH-10); ry = Constants.HEIGHT-10; }
        this.respawning = true;
        this.respawnTarget = { x: rx, y: ry };
        this.respawnLerpT = 0;
        return;
      }
    }

    // --- Apply velocity to ship position ---
    ship.cont.x += this.shipVelocity.x * dt;
    ship.cont.y += this.shipVelocity.y * dt;

    // --- Reduced drag for more speed ---
    this.shipVelocity.x *= 0.997; // was 0.995
    this.shipVelocity.y *= 0.997;

    // --- Attract coin powerup ---
    if (this.powerupState.attract && this.coin) {
      const dx = ship.cont.x - this.coin.x;
      const dy = ship.cont.y - this.coin.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < this.attractRadius) {
        this.coin.x += dx/dist * 8;
        this.coin.y += dy/dist * 8;
      }
    }

    // --- Multi-bullet powerup and bullet firing fix ---
    if (!this.lastSpace) this.lastSpace = false;
    if (this.space.isDown && !this.lastSpace) {
      this.shot_sound.play();
      if (this.powerupState.multi) {
        for (let spread = -15; spread <= 15; spread += 15) {
          this.bullets.fireBullet(
            ship.cont.x,
            ship.cont.y,
            ship.ship.angle - 90 + spread,
            () => {}
          );
        }
      } else {
        this.bullets.fireBullet(
          ship.cont.x,
          ship.cont.y,
          ship.ship.angle - 90,
          () => {}
        );
      }
      this.socket.emit("shot", { x: ship.cont.x, y: ship.cont.y });
      this.lastSpace = true;
    }
    if (this.space.isUp) {
      this.lastSpace = false;
    }

    // --- Powerup bar ---
    this.drawPowerupBar();

    this.emit_coordinates();
  }

  drawPowerupBar() {
    if (!this.powerupBarGraphics) return;
    this.powerupBarGraphics.clear();
    const ship = this.ship;
    const barWidth = 60;
    const barHeight = 8;
    let y = ship.cont.y - 40;
    let x = ship.cont.x - barWidth/2;
    let types = Object.keys(this.powerupState).filter(t => this.powerupState[t]);
    if (types.length === 0) return;
    let colorMap = { speed: 0x00ff00, multi: 0xff8800, attract: 0x00ffff };
    let idx = 0;
    for (let type of types) {
      // Remaining time
      let timer = this.powerupTimer[type];
      let progress = timer ? (timer.getRemaining() / 8000) : 0;
      this.powerupBarGraphics.fillStyle(colorMap[type], 1);
      this.powerupBarGraphics.fillRect(x, y + idx*(barHeight+2), barWidth * progress, barHeight);
      this.powerupBarGraphics.lineStyle(1, 0xffffff, 1);
      this.powerupBarGraphics.strokeRect(x, y + idx*(barHeight+2), barWidth, barHeight);
      idx++;
    }
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
      color: "#00FF00",
      fontFamily: "Arial",
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
    console.log("Initializing coin at:", x, y);
    var coin = this.add.sprite(x, y, "coin");
    coin.setDepth(1); // Ensure the coin is rendered above other elements
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
      this.scene.start("winner", {
        players,
        roomName: this.roomName
      });
    }
  };

  // Create info display for current room
  createRoomInfoDisplay() {
    const background = this.add.image(Constants.WIDTH / 2, Constants.HEIGHT / 2, 'background');
    background.setDisplaySize(Constants.WIDTH+50, Constants.HEIGHT+50);
    background.setDepth(-1);
    
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'space')
      .setOrigin(0)
      .setDepth(-1);
      
    this.roomInfoBg = this.add.rectangle(
      Constants.WIDTH - 150, 
      40, 
      280, 
      50, 
      0x000000, 
      0.7
    ).setOrigin(0.5);
    
    this.roomInfoText = this.add.text(
      Constants.WIDTH - 150, 
      40, 
      `ROOM: ${this.roomName}`, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#FFE81F',
        align: 'center'
      }
    ).setOrigin(0.5);
  }
  
  updateRoomInfoDisplay() {
    if (this.roomInfoText) {
      this.roomInfoText.setText(`ROOM: ${this.roomName}`);
    }
  }
  
  showDisconnectedMessage() {
    const overlay = this.add.rectangle(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2, 
      Constants.WIDTH, 
      Constants.HEIGHT, 
      0x000000, 
      0.8
    );
    
    const message = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2, 
      'DISCONNECTED FROM SERVER\nReturning to menu in 5 seconds...', {
        fontFamily: 'Arial',
        fontSize: '32px',
        color: '#FF3333',
        align: 'center'
      }
    ).setOrigin(0.5);
    
    this.time.delayedCall(5000, () => {
      this.scene.start('welcome');
    });
  }
  
  leaveRoom() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.scene.start('roomselection', this.name);
  }

  // Resize method to handle screen resizing
  resize(gameSize, baseSize, displaySize, resolution) {
    // Update background and other resizable elements
    if (this.background) {
      this.background.setDisplaySize(Constants.WIDTH + 50, Constants.HEIGHT + 50);
    }
    
    if (this.starfield) {
      this.starfield.setSize(Constants.WIDTH, Constants.HEIGHT);
    }
    
    // Reposition UI elements
    if (this.roomInfoBg && this.roomInfoText) {
      this.roomInfoBg.setPosition(Constants.WIDTH - 150, 40);
      this.roomInfoText.setPosition(Constants.WIDTH - 150, 40);
    }
    
    // Ensure the coin stays inside the playable area if it's been repositioned
    if (this.coin) {
      this.coin.x = Phaser.Math.Clamp(this.coin.x, 20, Constants.WIDTH - 20);
      this.coin.y = Phaser.Math.Clamp(this.coin.y, 20, Constants.HEIGHT - 20);
    }
  }

  spawnPowerup() {
    // Randomly pick a type
    const types = ["speed", "multi", "attract"];
    const type = Phaser.Utils.Array.GetRandom(types);
    const x = Phaser.Math.Between(60, Constants.WIDTH-60);
    const y = Phaser.Math.Between(60, Constants.HEIGHT-60);
    const powerup = this.powerups.create(x, y, "ship").setScale(0.6).setTint(type === "speed" ? 0x00ff00 : type === "multi" ? 0xff8800 : 0x00ffff);
    powerup.type = type;
    powerup.setDepth(2);
    powerup.body.setCircle(20);
    // Overlap with player
    this.physics.add.overlap(this.ship.ship, powerup, () => this.collectPowerup(powerup), null, this);
  }

  collectPowerup(powerup) {
    const type = powerup.type;
    powerup.destroy();
    this.powerupState[type] = true;
    if (this.powerupTimer[type]) this.powerupTimer[type].remove();
    // Powerup lasts 8 seconds
    this.powerupTimer[type] = this.time.delayedCall(8000, () => {
      this.powerupState[type] = false;
    });
  }
}

export default PlayGame;
