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
import bulletPowerup from "../assets/multi.png";
import speedPowerup from "../assets/speed.png";
import attractPowerup from "../assets/magnet.png";
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

    // Initialize team properties for team deathmatch mode
    this.team = params.team || null;
    this.teamScore = { red: 0, blue: 0 };

    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "http://localhost:10000";
    } else {
      this.ENDPOINT = process.env.ENDPOINT || window.location.origin;
    }

    this.keys = this.input.keyboard.createCursorKeys();
    this.space = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    this.score = 0;
    this.coinScore = 0; // Track coins separately
    this.asteroidsDestroyed = 0; // Track asteroids separately
    this.others = {}; // to store other players
    this.keystrokeState = "000000"; // Binary string for up, down, left, right, fire, collision
    this.othersKeystrokes = {}; // Map of other players' keystroke states
    this.x = Phaser.Math.Between(50, Constants.WIDTH - 50);
    this.y = Phaser.Math.Between(50, Constants.HEIGHT - 50);

    // For fly controls - now used in both blackhole and asteroid modes
    this.thrust = 0.95;
    this.rotationSpeed = 0;
    this.powerupState = { speed: false, multi: false, attract: false };
    this.powerupTimer = {};
    this.activePowerups = [];
    this.powerupBarGraphics = null;
    this.shipVelocity = { x: 0, y: 0 }; // Add for all game modes, not just blackhole

    // Others' powerup states
    this.othersPowerupState = {};
    this.othersPowerupTimer = {};
    
    // Blackhole level properties
    this.blackholeMass = 24000;
    this.shipMass = 1;
    this.G = 6500; // Gravitational constant for gameplay feel
    this.respawning = false;
    this.respawnTarget = null;
    this.respawnLerpT = 0;

    // Use existing socket if available (from room selection)
    this.socket = window.gameSocket || null;

    // Additional initialization based on game mode
    this.initializeGameMode();
  }

  // Initialize specific game mode settings
  initializeGameMode() {
    switch(this.level) {
      case "team":
        this.friendlyFire = false; // Disable friendly fire for team mode
        this.teamColors = { red: 0xff0000, blue: 0x0000ff };
        break;
      
      case "asteroid":
        this.asteroidTimer = null;
        this.asteroidGroup = null;
        this.asteroidScore = 0; // Specific score for asteroid destruction
        break;
      
      case "blackhole":
        // Existing blackhole mode settings already handled
        break;
      
      case "classic":
      default:
        // Default settings already handled
        break;
    }
  }

  preload() {
    this.load.image('background', background);
    this.load.image('space', starsBackground);
    this.load.spritesheet("boom", Explosion, {
      frameWidth: 64,
      frameHeight: 64,
      endFrame: 23,
    });
    this.load.image("coin", Coin);
    this.load.image("ship", Spaceship);
    this.load.image("bullet", BulletIcon);
    this.load.image('blackhole', BlackholeImg);
    // Load powerup assets
    this.load.image('multi', bulletPowerup);
    this.load.image('speed', speedPowerup);
    this.load.image('attract', attractPowerup);
    this.load.audio("explosion", ExplosionSound);
    this.load.audio("shot", ShotSound);
    this.load.audio("coin", CoinSound);
    
    // Load asteroid assets
    this.load.image('asteroid-large', starsBackground); // Placeholder
    this.load.image('asteroid-medium', starsBackground); // Placeholder
    this.load.image('asteroid-small', starsBackground); // Placeholder
    
    // Create asteroid textures dynamically
    this.load.on('complete', () => {
      if (this.level === "asteroid") {
        this.createAsteroidTextures();
      }
    });
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

    // Initialize mode-specific elements
    if (this.level === "team") {
      this.initTeamDeathmatch();
    } else if (this.level === "asteroid") {
      this.initAsteroidMode();
    } else if (this.level === "blackhole") {
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

    // Add blackhole mode specific socket events
    if (this.level === "blackhole") {
      // Listen for powerup spawns from server
      this.socket.on("powerup_spawned", (powerupData) => {
        this.createPowerupFromServer(powerupData);
      });
      
      // Listen for powerup collection by any player
      this.socket.on("powerup_collected", (data) => {
        const { id, playerId, playerName, powerupType, expiresAt } = data;
        
        // Remove the powerup sprite
        this.removePowerupById(id);
        
        if (playerId === this.id) {
          // This is us - local handling is already done in collectPowerup
          // But we should synchronize the timer with the server
          const remainingTime = expiresAt - Date.now();
          this.syncPowerupTimer(powerupType, remainingTime);
        } else {
          // Handle other player's powerup collection
          this.setOtherPlayerPowerup(playerId, powerupType, expiresAt);
        }
      });
      
      // Listen for powerup expiry
      this.socket.on("powerup_expired", (data) => {
        this.removePowerupById(data.id);
      });
      
      // Listen for other player's powerup expiry
      this.socket.on("player_powerup_expired", (data) => {
        const { playerId, powerupType } = data;
        this.clearOtherPlayerPowerup(playerId, powerupType);
      });
    }

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
    } else if (this.level === "asteroid") {
      // Use flying movement for asteroid mode too
      this.updateAsteroidLevel(delta, newState);
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
      this.movePlayerBasedOnKeystroke(this.keystrokeState, this.ship, delta);

      // Update other players' positions based on their keystroke states
      for (const id in this.othersKeystrokes) {
          if (this.others[id] && this.others[id].ship) {
              this.movePlayerBasedOnKeystroke(this.othersKeystrokes[id], this.others[id].ship, delta);
          }
      }

      // Check for bullet collisions with other players
      this.checkBulletCollisions();
    }

    this.emit_coordinates();
  }

  // Add the missing checkBulletCollisions function
  checkBulletCollisions() {
    if (!this.bullets || !this.bullets.children) return;
    
    this.bullets.children.each((bullet) => {
      if (bullet.active) {
        for (const id in this.others) {
          if (!this.others[id] || !this.others[id].ship || !this.others[id].ship.cont) continue;
          
          const other = this.others[id].ship.cont;
          const distance = Phaser.Math.Distance.Between(
            bullet.x, bullet.y,
            other.x, other.y
          );
          
          // Simple distance-based collision detection
          if (distance < 30) { // adjust collision radius as needed
            // Set bullet to inactive
            bullet.setActive(false);
            bullet.setVisible(false);
            
            // Emit collision event
            this.socket.emit("collision", { 
              bullet_user_id: this.id, 
              bullet_index: this.bullets.children.entries.indexOf(bullet),
              target_id: id 
            });
            
            // Animate explosion
            this.animate_explosion(id);
            
            // Reduce other player's score
            if (this.others[id]) {
              const otherScore = Math.max(0, this.others[id].score - 2);
              this.others[id].score = otherScore;
              this.others[id].ship.score_text.setText(`${this.others[id].name}: ${otherScore}`);
            }
          }
        }
      }
    });
  }

  // Add the movement function that was missing
  movePlayerBasedOnKeystroke(keystrokeState, playerShip, delta) {
    // Base speed (pixels per frame)
    const baseSpeed = 5 * (delta / 16.667); // Scale with frame delta for consistent speed
    
    // Movement based on keystroke state binary string
    // Format: "UDLRF" (Up, Down, Left, Right, Fire)
    const up = keystrokeState[0] === "1";
    const down = keystrokeState[1] === "1";
    const left = keystrokeState[2] === "1";
    const right = keystrokeState[3] === "1";
    
    // Apply movement
    if (up) playerShip.cont.y -= baseSpeed;
    if (down) playerShip.cont.y += baseSpeed;
    if (left) playerShip.cont.x -= baseSpeed;
    if (right) playerShip.cont.x += baseSpeed;
    
    // Keep player in bounds
    playerShip.cont.x = Phaser.Math.Clamp(
      playerShip.cont.x,
      25,
      Constants.WIDTH - 25
    );
    playerShip.cont.y = Phaser.Math.Clamp(
      playerShip.cont.y,
      25,
      Constants.HEIGHT - 25
    );
    
    // Update ship rotation based on movement direction
    if (left || right || up || down) {
      let angle = 0;
      if (up) {
        angle = 180; // Changed from -90 to 180 for upward movement
        if (right) angle -= 45; // Adjusted rotation direction
        if (left) angle += 45;  // Adjusted rotation direction
      } else if (down) {
        angle = 0;  // Changed from 90 to 0 for downward movement
        if (right) angle += 45;
        if (left) angle -= 45;
      } else if (right) {
        angle = 270; // Changed from 0 to 270 for rightward movement
      } else if (left) {
        angle = 90;  // Changed from 180 to 90 for leftward movement
      }
      playerShip.ship.setAngle(angle+180);
    }
  }
  
  initBlackholeLevel() {
    // Blackhole in center
    this.blackhole = this.add.sprite(Constants.WIDTH/2, Constants.HEIGHT/2, "blackhole").setScale(0.5).setDepth(2);
    this.physics.add.existing(this.blackhole, false);
    this.blackhole.body.setCircle(this.blackhole.width/2 * 0.5);
    // Powerup group
    this.powerups = this.physics.add.group();
    this.powerupMap = new Map(); // Maps powerup id to powerup sprite
    
    // Instead of directly spawning powerups, request from the server
    this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => {
        // Request powerup from server
        this.socket.emit("request_spawn_powerup");
      }
    });

    // Attract coin effect
    this.attractRadius = 200;

    // Powerup bar graphics
    this.powerupBarGraphics = this.add.graphics().setDepth(10);

    // Blackhole physics: add velocity for the ship
    this.shipVelocity = { x: 0, y: 0 };
  }

  // Create a powerup from server data
  createPowerupFromServer(powerupData) {
    if (!this.powerups) return;
    
    const { id, type, x, y } = powerupData;
    
    // Create the powerup sprite
    const powerup = this.powerups.create(x, y, type).setScale(0.5);
    powerup.id = id;
    powerup.type = type;
    powerup.setDepth(2);
    
    // Store in map for easy lookup
    this.powerupMap.set(id, powerup);
    
    // Add rotation animation for powerups
    this.tweens.add({
      targets: powerup,
      angle: 360,
      duration: 3000,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Add pulsing effect
    this.tweens.add({
      targets: powerup,
      scale: 0.6,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    
    powerup.body.setCircle(20);
    // Overlap with player
    this.physics.add.overlap(this.ship.ship, powerup, () => this.collectPowerup(powerup), null, this);
    
    return powerup;
  }
  
  // Remove a powerup by ID
  removePowerupById(id) {
    if (!this.powerupMap) return;
    
    const powerup = this.powerupMap.get(id);
    if (powerup) {
      this.tweens.killTweensOf(powerup);
      powerup.destroy();
      this.powerupMap.delete(id);
    }
  }

  collectPowerup(powerup) {
    const type = powerup.type;
    const id = powerup.id;
    
    // Add collection effect
    this.tweens.add({
      targets: powerup,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        if (this.powerupMap) {
          this.powerupMap.delete(id);
        }
        powerup.destroy();
      }
    });
    
    // Update local state
    this.powerupState[type] = true;
    if (this.powerupTimer[type]) this.powerupTimer[type].remove();
    
    // Powerup lasts 8 seconds locally
    this.powerupTimer[type] = this.time.delayedCall(8000, () => {
      this.powerupState[type] = false;
    });
    
    // Notify server of collection
    this.socket.emit("collect_powerup", { powerupId: id, powerupType: type });
  }
  
  // Synchronize local powerup timer with server
  syncPowerupTimer(type, remainingTime) {
    if (this.powerupTimer[type]) {
      this.powerupTimer[type].remove();
    }
    
    this.powerupState[type] = true;
    this.powerupTimer[type] = this.time.delayedCall(remainingTime, () => {
      this.powerupState[type] = false;
    });
  }
  
  // Set another player's powerup state
  setOtherPlayerPowerup(playerId, type, expiresAt) {
    // Initialize player if needed
    if (!this.othersPowerupState[playerId]) {
      this.othersPowerupState[playerId] = { speed: false, multi: false, attract: false };
      this.othersPowerupTimer[playerId] = {};
    }
    
    // Set the powerup state to active
    this.othersPowerupState[playerId][type] = true;
    
    // Clear existing timer if any
    if (this.othersPowerupTimer[playerId][type]) {
      this.othersPowerupTimer[playerId][type].remove();
    }
    
    // Set expiry timer
    const remainingTime = expiresAt - Date.now();
    if (remainingTime > 0) {
      this.othersPowerupTimer[playerId][type] = this.time.delayedCall(remainingTime, () => {
        if (this.othersPowerupState[playerId]) {
          this.othersPowerupState[playerId][type] = false;
        }
      });
    }
  }
  
  // Clear another player's powerup
  clearOtherPlayerPowerup(playerId, type) {
    if (this.othersPowerupState[playerId]) {
      this.othersPowerupState[playerId][type] = false;
      
      if (this.othersPowerupTimer[playerId] && this.othersPowerupTimer[playerId][type]) {
        this.othersPowerupTimer[playerId][type].remove();
        this.othersPowerupTimer[playerId][type] = null;
      }
    }
  }

  updateBlackholeLevel(delta) {
    const dt = delta / 1000;
    const keys = this.keys;
    let ship = this.ship;
    // --- Increased speed ---
    let speed = this.powerupState.speed ? 4800 : 3500; // was 1200/800
    let rotSpeed = 120; // was 220

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
    this.shipVelocity.x *= 0.955; // was 0.995
    this.shipVelocity.y *= 0.955;

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

    // --- Powerup bar for self and others ---
    this.drawAllPowerupBars();

    this.emit_coordinates();
  }

  drawAllPowerupBars() {
    if (!this.powerupBarGraphics) return;
    this.powerupBarGraphics.clear();
    
    // Draw powerup bar for self
    this.drawPowerupBarForPlayer(this.ship.cont, this.powerupState, this.powerupTimer);
    
    // Draw powerup bars for other players
    for (const id in this.others) {
      if (this.others[id] && this.others[id].ship && this.others[id].ship.cont) {
        const otherShip = this.others[id].ship.cont;
        if (this.othersPowerupState[id]) {
          this.drawPowerupBarForPlayer(
            otherShip,
            this.othersPowerupState[id],
            this.othersPowerupTimer[id] || {}
          );
        }
      }
    }
  }

  drawPowerupBarForPlayer(shipContainer, powerupState, powerupTimer) {
    const barWidth = 60;
    const barHeight = 8;
    let y = shipContainer.y - 40;
    let x = shipContainer.x - barWidth/2;
    let types = Object.keys(powerupState).filter(t => powerupState[t]);
    if (types.length === 0) return;
    
    let colorMap = { speed: 0x00ff00, multi: 0xff8800, attract: 0x00ffff };
    let idx = 0;
    for (let type of types) {
      // Remaining time
      let timer = powerupTimer[type];
      let progress = 1;
      
      if (timer && timer.getRemaining) {
        progress = timer.getRemaining() / 8000;
      } else if (timer && timer.getElapsed) {
        progress = 1 - (timer.getElapsed() / 8000);
      }
      
      // Ensure progress is in valid range
      progress = Math.max(0, Math.min(1, progress));
      
      this.powerupBarGraphics.fillStyle(colorMap[type], 1);
      this.powerupBarGraphics.fillRect(x, y + idx*(barHeight+2), barWidth * progress, barHeight);
      this.powerupBarGraphics.lineStyle(1, 0xffffff, 1);
      this.powerupBarGraphics.strokeRect(x, y + idx*(barHeight+2), barWidth, barHeight);
      idx++;
    }
  }

  // Replace existing drawPowerupBar method
  drawPowerupBar() {
    this.drawAllPowerupBars();
  }

updateAsteroidLevel(delta, newState) {
    const dt = delta / 1000;
    const keys = this.keys;
    let ship = this.ship;
    
    // Speed settings
    let speed = this.powerupState.speed ? 4800 : 3500;
    let rotSpeed = 120;

    // Handle rotation with left/right keys
    if (keys.left.isDown) {
      ship.ship.angle -= rotSpeed * dt;
    }
    if (keys.right.isDown) {
      ship.ship.angle += rotSpeed * dt;
    }
    
    // Apply thrust in ship's facing direction when up key is pressed
    if (keys.up.isDown) {
      const angleRad = Phaser.Math.DegToRad(ship.ship.angle - 90);
      this.shipVelocity.x += Math.cos(angleRad) * speed * dt;
      this.shipVelocity.y += Math.sin(angleRad) * speed * dt;
    }
    
    // Gentle braking when down key is pressed
    if (keys.down.isDown) {
      this.shipVelocity.x *= 0.92;
      this.shipVelocity.y *= 0.92;
    }
    
    // Apply velocity to position
    ship.cont.x += this.shipVelocity.x * dt;
    ship.cont.y += this.shipVelocity.y * dt;
    
    // Apply drag to slow down over time (less than blackhole for more responsive feel)
    this.shipVelocity.x *= 0.955;
    this.shipVelocity.y *= 0.955;
    
    // Handle bullet firing
    if (!this.lastSpace && keys.space.isDown) {
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
    if (keys.space.isUp) {
      this.lastSpace = false;
    }
    
    // Update asteroid positions
    this.updateAsteroids(delta);
    
    // Check for bullet collisions with other players
    this.checkBulletCollisions();
    
    // Check for bullet collisions with asteroids
    // Already handled by physics system
    
    // Emit keystroke state if it has changed
    if (newState !== this.keystrokeState) {
      this.keystrokeState = newState;
      this.socket.emit("keystroke_state", newState);
    }
    
    // Draw powerup bar if active
    if (this.powerupBarGraphics) {
      this.drawPowerupBar();
    }
  }

  initTeamDeathmatch() {
    // Create team indicator
    const teamIndicator = this.add.container(Constants.WIDTH - 150, 80);
    
    const teamBg = this.add.rectangle(0, 0, 150, 40, 0x000000, 0.7)
      .setStrokeStyle(2, this.team === 'red' ? 0xff0000 : 0x0000ff);
    teamIndicator.add(teamBg);
    
    const teamText = this.add.text(0, 0, `TEAM: ${this.team.toUpperCase()}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: this.team === 'red' ? '#ff0000' : '#0000ff',
      align: 'center'
    }).setOrigin(0.5);
    teamIndicator.add(teamText);
    
    // Team scoreboard
    const scoreboard = this.add.container(Constants.WIDTH - 150, 120);
    
    const scoreBg = this.add.rectangle(0, 0, 150, 60, 0x000000, 0.7)
      .setStrokeStyle(1, 0xFFFFFF, 0.5);
    scoreboard.add(scoreBg);
    
    this.redScoreText = this.add.text(-30, -10, "RED: 0", {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#ff0000'
    }).setOrigin(0.5);
    scoreboard.add(this.redScoreText);
    
    this.blueScoreText = this.add.text(-30, 10, "BLUE: 0", {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#0000ff'
    }).setOrigin(0.5);
    scoreboard.add(this.blueScoreText);
    
    // Apply team color to player's ship
    this.ship.ship.setTint(this.team === 'red' ? 0xff0000 : 0x0000ff);
    
    // Listen for team score updates
    this.socket.on("team_score_update", (scores) => {
      this.teamScore = scores;
      this.redScoreText.setText(`RED: ${scores.red}`);
      this.blueScoreText.setText(`BLUE: ${scores.blue}`);
      
      // Check for team win
      if (scores.red >= Constants.POINTS_TO_WIN || scores.blue >= Constants.POINTS_TO_WIN) {
        this.handleTeamWin(scores.red > scores.blue ? 'red' : 'blue');
      }
    });
  }
  
  initAsteroidMode() {
    // Create asteroid group
    this.asteroidGroup = this.physics.add.group();
    
    // Asteroid tracking
    this.asteroidMap = new Map(); // Maps asteroidId to asteroid object
    this.asteroidsDestroyed = 0;
    this.receivedServerAsteroids = false;
    
    // Start spawning asteroids - server will control actual spawning
    this.asteroidTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.socket && this.id === this.getLowestPlayerId()) {
          // Only one client should initiate asteroid creation
          for (let i = 0; i < 3; i++) {
            this.requestNewAsteroid();
          }
        }
      },
      callbackScope: this,
      loop: true
    });
    
    // Add asteroid score display
    const scoreContainer = this.add.container(Constants.WIDTH - 150, 80);
    
    const scoreBg = this.add.rectangle(0, 0, 150, 40, 0x000000, 0.7)
      .setStrokeStyle(2, 0xFFFFFF, 0.5);
    scoreContainer.add(scoreBg);
    
    this.asteroidScoreText = this.add.text(0, 0, `ASTEROIDS: 0`, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    scoreContainer.add(this.asteroidScoreText);
    
    // Add coin score display
    const coinScoreContainer = this.add.container(Constants.WIDTH - 150, 130);
    
    const coinScoreBg = this.add.rectangle(0, 0, 150, 40, 0x000000, 0.7)
      .setStrokeStyle(2, 0xFFDD00, 0.5);
    coinScoreContainer.add(coinScoreBg);
    
    this.coinScoreText = this.add.text(0, 0, `COINS: 0`, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFDD00',
      align: 'center'
    }).setOrigin(0.5);
    coinScoreContainer.add(this.coinScoreText);
    
    // Set up collision between bullets and asteroids
    this.physics.add.collider(this.bullets, this.asteroidGroup, this.hitAsteroid, null, this);
    
    // Set up collision between player ship and asteroids
    this.physics.add.collider(this.ship.cont, this.asteroidGroup, this.playerHitAsteroid, null, this);
    
    // Listen for asteroid spawn events
    this.socket.on("new_asteroid", (asteroidData) => {
      this.spawnAsteroid(asteroidData);
    });
    
    // Listen for asteroid hit events
    this.socket.on("asteroid_hit", (data) => {
      const { asteroidId, playerId, playerScore, playerAsteroidCount } = data;
      
      // Update the asteroid
      const asteroid = this.asteroidMap.get(asteroidId);
      if (asteroid) {
        this.createExplosion(asteroid.x, asteroid.y);
        asteroid.destroy();
        this.asteroidMap.delete(asteroidId);
        
        // If another player hit it, update their score
        if (playerId !== this.id && this.others[playerId]) {
          this.others[playerId].score = playerScore;
          this.others[playerId].asteroidsDestroyed = playerAsteroidCount;
          this.others[playerId].ship.score_text.setText(
            `${this.others[playerId].name}: ${playerScore}`
          );
        }
      }
    });
    
    // Initial batch of asteroids from server
    this.socket.on("initial_asteroids", (asteroids) => {
      this.receivedServerAsteroids = true;
      asteroids.forEach(asteroidData => {
        this.spawnAsteroid(asteroidData);
      });
    });
    
    // Request initial asteroids from server
    this.socket.emit("get_asteroids");
  }
  updateAsteroids(delta) {
    if (!this.asteroidGroup) return;
    
    // Update position of each asteroid based on orbital parameters
    this.asteroidMap.forEach((asteroid, id) => {
      if (asteroid.active && !asteroid.destroyed) {
        // Calculate new position based on orbital parameters
        const orbitParams = asteroid.getData('orbitParams');
        const createdAt = asteroid.getData('createdAt');
        const elapsedTime = (Date.now() - createdAt) / 1000; // Time in seconds
        
        if (orbitParams) {
          // Calculate new position based on orbital parameters
          const newPos = this.calculateOrbitPosition(orbitParams, elapsedTime);
          asteroid.x = newPos.x;
          asteroid.y = newPos.y;
          
          // Check if asteroid is off-screen and should be removed
          if (asteroid.x < -100 || asteroid.x > Constants.WIDTH + 100 || 
              asteroid.y < -100 || asteroid.y > Constants.HEIGHT + 100) {
            if (!asteroid.offScreenTime) {
              asteroid.offScreenTime = Date.now();
            } else if (Date.now() - asteroid.offScreenTime > 3000) {
              // Remove asteroid after being off-screen for 3 seconds
              asteroid.destroy();
              this.asteroidMap.delete(id);
            }
          } else {
            asteroid.offScreenTime = null;
          }
        }
      }
    });
  }
  
  // Generate orbital parameters for an asteroid
  generateOrbitParams(x, y, vx, vy) {
    // Create parameters for an elliptical or hyperbolic orbit
    const params = {
      // Starting position
      startX: x,
      startY: y,
      // Velocity components
      vx: vx,
      vy: vy,
      // Add some curvature to the path
      curvature: Phaser.Math.FloatBetween(0.1, 0.5) * (Math.random() > 0.5 ? 1 : -1),
      // Random variations
      wobble: {
        amplitude: Phaser.Math.FloatBetween(0, 15),
        frequency: Phaser.Math.FloatBetween(0.1, 0.5)
      }
    };
    
    return params;
  }
  
  // Calculate position on orbital path at given time
  calculateOrbitPosition(params, time) {
    const { startX, startY, vx, vy, curvature, wobble } = params;
    
    // Base position is linear motion
    let x = startX + vx * time;
    let y = startY + vy * time;
    
    // Add curved path component
    x += curvature * vy * time * time * 0.5;
    y -= curvature * vx * time * time * 0.5;
    
    // Add wobble if specified
    if (wobble) {
      x += Math.sin(time * wobble.frequency * Math.PI * 2) * wobble.amplitude;
      y += Math.cos(time * wobble.frequency * Math.PI * 2) * wobble.amplitude;
    }
    
    return { x, y };
  }
  
  checkWinCondition() {
    // Check if player has enough coins (100+) and maximum asteroid hits
    if (this.coinScore >= 100) {
      let hasMoreAsteroids = false;
      
      // Check if anyone else has destroyed more asteroids
      for (let id in this.others) {
        if (this.others[id].asteroidsDestroyed > this.asteroidsDestroyed) {
          hasMoreAsteroids = true;
          break;
        }
      }
      
      // Win if no one has more asteroids destroyed and we have 100+ coins
      if (!hasMoreAsteroids) {
        this.declareWinner();
      }
    }
  }

  declareWinner() {
    let players = [{ 
      name: this.name, 
      score: this.coinScore, // Use coin score for overall score
      asteroidsDestroyed: this.asteroidsDestroyed 
    }];
    
    for (let id in this.others) {
      players.push({
        name: this.others[id].name,
        score: this.others[id].coinScore || this.others[id].score, // Use coin score if available
        asteroidsDestroyed: this.others[id].asteroidsDestroyed || 0
      });
    }
    
    // Sort by asteroid count first, then by coin score
    players.sort((a, b) => {
      const asteroidDiff = b.asteroidsDestroyed - a.asteroidsDestroyed;
      if (asteroidDiff !== 0) return asteroidDiff;
      return b.score - a.score; 
    });
    
    // Disconnect and show winners
    setTimeout(() => this.socket.disconnect(), 20);
    this.scene.start("winner", {
      players,
      roomName: this.roomName,
      level: "asteroid",
      asteroidMode: true
    });
  }

  // Helper method to create explosion
  createExplosion(x, y) {
    const boom = this.add.sprite(x, y, "boom");
    boom.setDepth(3);
    boom.anims.play("explode");
    this.explosion_sound.play();
    
    // Remove explosion sprite once animation completes
    boom.on('animationcomplete', () => {
      boom.destroy();
    });
  }


  createAsteroidTextures() {
    const sizes = ['large', 'medium', 'small'];
    const colors = [0xcccccc, 0xaaaaaa, 0x888888];
    
    sizes.forEach((size, i) => {
      // Create a graphics object to draw the asteroid
      const graphics = this.make.graphics({x: 0, y: 0, add: false});
      
      // Set fill style with a slight variation
      graphics.fillStyle(colors[i], 1);
      
      // Draw a rock-like shape with irregular edges
      const radius = size === 'large' ? 40 : (size === 'medium' ? 25 : 15);
      const points = [];
      const segments = 12;
      
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const variance = Phaser.Math.Between(85, 115) / 100;
        const x = Math.cos(angle) * radius * variance;
        const y = Math.sin(angle) * radius * variance;
        points.push({ x, y });
      }
      
      // Connect points to form asteroid shape
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        graphics.lineTo(points[i].x, points[i].y);
      }
      
      graphics.closePath();
      graphics.fillPath();
      
      // Add some crater details
      graphics.fillStyle(0x666666, 0.6);
      
      const craterCount = size === 'large' ? 4 : (size === 'medium' ? 3 : 2);
      for (let i = 0; i < craterCount; i++) {
        const craterSize = radius * (Phaser.Math.Between(15, 25) / 100);
        const craterX = Phaser.Math.Between(-radius * 0.5, radius * 0.5);
        const craterY = Phaser.Math.Between(-radius * 0.5, radius * 0.5);
        graphics.fillCircle(craterX, craterY, craterSize);
      }
      
      // Add a stroke around the edge
      graphics.lineStyle(2, 0x555555, 1);
      graphics.strokePath();
      
      // Generate the texture
      graphics.generateTexture(`asteroid-${size}-actual`, radius * 2.5, radius * 2.5);
    });
  }
  
  getLowestPlayerId() {
    // Get the lowest player ID in the room (for determining who spawns asteroids)
    const playerIds = Object.keys(this.others);
    playerIds.push(this.id);
    return playerIds.sort()[0];
  }
  
  requestNewAsteroid() {
    // Ask server to create a new asteroid with orbital parameters
    this.socket.emit("spawn_asteroid");
  }
  
  spawnAsteroid(asteroidData) {
    if (!this.asteroidGroup) return;
    
    const { id, size, x, y, vx, vy, orbitParams, createdAt } = asteroidData;
    
    // Create the asteroid
    const asteroid = this.asteroidGroup.create(x, y, `asteroid-${size}-actual`);
    
    asteroid.id = id;
    asteroid.size = size;
    asteroid.health = size === 'large' ? 3 : (size === 'medium' ? 2 : 1);
    asteroid.setData('orbitParams', orbitParams);
    asteroid.setData('createdAt', createdAt);
    asteroid.setData('startPosition', { x, y });
    
    // Set velocity (initial direction)
    asteroid.setVelocity(vx, vy);
    
    // Set angular velocity for rotation
    asteroid.setAngularVelocity(Phaser.Math.Between(-50, 50));
    
    // Set circular body for better collision detection
    asteroid.body.setCircle(asteroid.width / 3);
    
    // Store reference to the asteroid
    this.asteroidMap.set(id, asteroid);
    
    // Remove asteroid if it goes off screen for too long
    this.time.delayedCall(15000, () => {
      if (asteroid.active && !asteroid.destroyed) {
        asteroid.destroy();
        this.asteroidMap.delete(id);
      }
    });
    
    return asteroid;
  }
  
  // Method to handle bullet hitting asteroid
  hitAsteroid(bullet, asteroid) {
    if (asteroid.destroyed) return;
    
    // Deactivate the bullet
    bullet.setActive(false).setVisible(false);
    
    asteroid.health--;
    
    if (asteroid.health <= 0) {
      // Mark as destroyed to prevent double processing
      asteroid.destroyed = true;
      
      // Explosion effect
      this.createExplosion(asteroid.x, asteroid.y);
      
      // Award points based on size (but keep separate from coin score)
      const points = asteroid.size === 'large' ? 5 : (asteroid.size === 'medium' ? 3 : 1);
      this.asteroidsDestroyed += points;
      
      // Update UI for asteroid score
      this.asteroidScoreText.setText(`ASTEROIDS: ${this.asteroidsDestroyed}`);
      
      // Keep overall score as coin score only
      this.score = this.coinScore;
      this.ship.score_text.setText(`${this.name}: ${this.score}`);
      
      // Remove from tracking map
      this.asteroidMap.delete(asteroid.id);
      
      // Notify server about the hit
      this.socket.emit("asteroid_destroyed", {
        asteroidId: asteroid.id,
        newScore: this.score,
        asteroidsDestroyed: this.asteroidsDestroyed,
        coinScore: this.coinScore
      });
      
      // Split into smaller asteroids if large or medium
      if (asteroid.size !== 'small' && this.id === this.getLowestPlayerId()) {
        this.splitAsteroid(asteroid);
      }
      
      // Destroy the asteroid
      asteroid.destroy();
      
      // Check for win condition
      this.checkWinCondition();
    }
  }
  
  // Method to split asteroids into smaller pieces
  splitAsteroid(asteroid) {
    const newSize = asteroid.size === 'large' ? 'medium' : 'small';
    const count = 2; // Number of pieces to split into
    
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.DegToRad(i * (360/count));
      const speed = 100;
      
      // Create orbital parameters for the split asteroids
      const orbitParams = this.generateOrbitParams(
        asteroid.x, 
        asteroid.y,
        Math.cos(angle) * speed + asteroid.body.velocity.x * 0.5,
        Math.sin(angle) * speed + asteroid.body.velocity.y * 0.5
      );
      
      // Request new asteroids from the server
      this.socket.emit("spawn_asteroid_split", {
        size: newSize,
        x: asteroid.x,
        y: asteroid.y,
        vx: Math.cos(angle) * speed + asteroid.body.velocity.x * 0.5,
        vy: Math.sin(angle) * speed + asteroid.body.velocity.y * 0.5,
        orbitParams
      });
    }
  }
  
  // Method to handle player ship colliding with asteroid - fixed to prevent adding unwanted momentum
  playerHitAsteroid(ship, asteroid) {
    if (asteroid.destroyed) return;
    
    // Create explosion effect
    this.createExplosion(asteroid.x, asteroid.y);
    
    // Create smoke effect around the player ship
    this.createSmokeEffect(ship);
    
    // Reduce player coin score instead of overall score
    this.coinScore = Math.max(0, this.coinScore - 2);
    
    // Update display
    if (this.coinScoreText) {
      this.coinScoreText.setText(`COINS: ${this.coinScore}`);
    }
    
    // Update total score and score text
     // Update total score to match coin score
    this.ship.score_text.setText(`${this.name}: ${this.coinScore}`);
    
    // Mark asteroid as destroyed to prevent multiple hits
    asteroid.destroyed = true;
    
    // Notify server about the collision
    this.socket.emit("player_asteroid_collision", {
      asteroidId: asteroid.id,
      newScore: this.score,
      newCoinScore: this.coinScore
    });
    
    // Apply a stop/bounce effect rather than adding momentum
    // This fixes the issue of perpetual movement after collision
    const angleToPlayer = Phaser.Math.Angle.Between(asteroid.x, asteroid.y, ship.x, ship.y);
    const bounceForce = 300;
    
    // Apply a counter-force and dampen current velocity
    this.shipVelocity.x = Math.cos(angleToPlayer) * bounceForce;
    this.shipVelocity.y = Math.sin(angleToPlayer) * bounceForce;
    
    // Destroy asteroid on impact
    this.asteroidMap.delete(asteroid.id);
    asteroid.destroy();
  }
  
  // Create a smoke effect when the player is hit
  createSmokeEffect(target) {
    try {
      // Create particle emitter for smoke
      const particles = this.add.particles(target.x, target.y, {
        key: 'particleTexture', // We'll create this texture below
        lifespan: 1000,
        gravityY: -50,
        scale: { start: 1, end: 0 },
        alpha: { start: 0.6, end: 0 },
        speed: { min: 20, max: 50 },
        angle: { min: 0, max: 360 },
        quantity: 1,
        frequency: 50,
        emitting: true,
        blendMode: 'SCREEN',
        tint: [0x999999, 0xCCCCCC]
      });
      
      // Generate particle texture if it doesn't exist
      if (!this.textures.exists('particleTexture')) {
        const graphics = this.add.graphics();
        graphics.fillStyle(0xFFFFFF);
        graphics.fillCircle(8, 8, 8);
        graphics.generateTexture('particleTexture', 16, 16);
        graphics.destroy();
      }
      
      // Follow the ship for a short time
      this.time.addEvent({
        delay: 50,
        repeat: 10, // 10 updates = 500ms
        callback: () => {
          if (target && target.active) {
            particles.setPosition(target.x, target.y);
          }
        }
      });
      
      // Stop emitting and destroy after a delay
      this.time.delayedCall(500, () => {
        if (particles && particles.active) {
          particles.emitting = false;
          this.time.delayedCall(1000, () => {
            if (particles && particles.active) {
              particles.destroy();
            }
          });
        }
      });
      
    } catch (error) {
      console.error("Error creating smoke effect:", error);
    }
  }

  /*
  Get a new game object consisting of:
  spaceship sprite, name and score.
  */
  get_new_spaceship = (x, y, score, name, angle) => {
  // Generate consistent color based on player name or ID
  const color = this.getPlayerColor(name);
  
  var score_text = this.add.text(-30, 25, `${name}: ${score}`, {
    color: "#00FF00",
    fontFamily: "Arial",
    align: "center",
    fontSize: "13px",
  });
  
  var ship = this.add.sprite(0, 0, "ship");
  ship.setAngle(angle);
  // Apply the color tint to the ship
  ship.setTint(color);
  
  var cont = this.add.container(x, y, [ship, score_text]);
  cont.setSize(45, 45);
  this.physics.add.existing(cont, false);
  this.physics.add.existing(ship, false);
  cont.body.setCollideWorldBounds(true);
  return { score_text, ship, cont };
};

// Add this new method to generate consistent colors
getPlayerColor = (name) => {
  // Use a simple hash function to generate a color from the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to RGB color and ensure minimum brightness
  const r = Math.min(255, Math.max(64, ((hash & 0xFF0000) >> 16))); // Range 128-255
  const g = Math.min(255, Math.max(64, ((hash & 0x00FF00) >> 8)));  // Range 128-255
  const b = Math.min(255, Math.max(64, (hash & 0x0000FF)));         // Range 128-255
  
  // Create color integer for Phaser
  return (r << 16) | (g << 8) | b;
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
    
    // Increment both coin score and total score
    this.coinScore += 5;
    this.score = this.coinScore;
    
    // Update display
    if (this.coinScoreText) {
      this.coinScoreText.setText(`COINS: ${this.coinScore}`);
    }
    
    this.ship.score_text.setText(`${this.name}: ${this.coinScore}`);
    this.socket.emit("update_coin", {
      x: coin.x,
      y: coin.y,
    });
    this.check_for_winner(this.coinScore);
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
    
    // Use the dedicated powerup assets instead of tinted ships
    const powerup = this.powerups.create(x, y, type).setScale(0.5);
    powerup.type = type;
    powerup.setDepth(2);
    
    // Add rotation animation for powerups
    this.tweens.add({
      targets: powerup,
      angle: 360,
      duration: 3000,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Add pulsing effect
    this.tweens.add({
      targets: powerup,
      scale: 0.6,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    
    powerup.body.setCircle(20);
    // Overlap with player
    this.physics.add.overlap(this.ship.ship, powerup, () => this.collectPowerup(powerup), null, this);
  }

  collectPowerup(powerup) {
    const type = powerup.type;
    
    // Add collection effect
    this.tweens.add({
      targets: powerup,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => powerup.destroy()
    });
    
    this.powerupState[type] = true;
    if (this.powerupTimer[type]) this.powerupTimer[type].remove();
    // Powerup lasts 8 seconds
    this.powerupTimer[type] = this.time.delayedCall(8000, () => {
      this.powerupState[type] = false;
    });
  }

  drawPowerupBar() {
    if (!this.powerupBarGraphics) return;
    this.powerupBarGraphics.clear();
    const ship = this.ship;
    
    // Ensure ship is valid
    if (!ship || !ship.cont) return;
    
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
}

export default PlayGame;
