import Phaser from "phaser";
import Constants from "../constants";
import starsBackground from "../assets/stars.png";

export default class LevelSelect extends Phaser.Scene {
  constructor() {
    super("levelselect");
  }

  init(playerName) {
    this.playerName = playerName;
    this.selected = 0;
    this.levels = [
      { 
        name: "Classic", 
        key: "classic", 
        description: "The original gameplay. Collect coins and avoid enemy fire in this free-for-all galactic battle.",
        color: 0x3498db
      },
      { 
        name: "Blackhole", 
        key: "blackhole", 
        description: "Navigate around a dangerous blackhole that pulls your ship. Collect powerups to gain advantages.",
        color: 0x9b59b6
      },
      { 
        name: "Team Deathmatch", 
        key: "team", 
        description: "Join forces with other pilots! Red team vs Blue team in an epic space battle.",
        color: 0xe74c3c
      },
      { 
        name: "Asteroid Field", 
        key: "asteroid", 
        description: "Dodge deadly asteroids while collecting coins. Extra points for shooting asteroids!",
        color: 0xf39c12
      }
    ];
  }

  preload() {
    this.load.image('stars', starsBackground);
    // Load mode-specific icons (these would need to be created)
    this.load.image('icon-classic', starsBackground);
    this.load.image('icon-blackhole', starsBackground);
    this.load.image('icon-team', starsBackground);
    this.load.image('icon-asteroid', starsBackground);
  }

  create() {
    // Create animated starfield background
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'stars')
      .setOrigin(0)
      .setDepth(-1);
    
    // Add header with player name and title
    this.add.text(Constants.WIDTH/2, 80, `MISSION SELECTION`, {
      fontFamily: 'Arial Black',
      fontSize: '48px',
      color: '#FFE81F',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 2, true);
    
    // Welcome message with player name
    this.add.text(Constants.WIDTH/2, 130, `Greetings, Commander ${this.playerName}!`, {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    
    // Create container for game mode cards
    this.modeContainer = this.add.container(Constants.WIDTH/2, Constants.HEIGHT/2 + 30);
    
    // Create mode selection cards
    this.createModeCards();
    
    // Add navigation instructions
    const instructions = this.add.text(Constants.WIDTH/2, Constants.HEIGHT - 50, 
      '← → : Navigate Modes | ENTER : Select Mode', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#AAAAAA',
      backgroundColor: '#00000088',
      padding: { x: 15, y: 8 }
    }).setOrigin(0.5);
    
    // Fade in effect for entire scene
    this.cameras.main.fadeIn(1000, 0, 0, 0);
    
    // Setup keyboard controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    
    // Add particles for active card
    this.createParticleEmitter();
  }
  
  createModeCards() {
    this.cards = [];
    const cardWidth = 240;
    const cardHeight = 320;
    const padding = 30;
    const totalWidth = (cardWidth + padding) * this.levels.length;
    const startX = -(totalWidth / 2) + (cardWidth / 2);
    
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      const x = startX + i * (cardWidth + padding);
      
      // Create card container
      const card = this.add.container(x, 0);
      card.originalX = x;
      
      // Card background with border
      const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, level.color, 0.7)
        .setStrokeStyle(4, 0xFFFFFF, i === this.selected ? 1 : 0.3);
      card.add(bg);
      
      // Mode title
      const title = this.add.text(0, -cardHeight/2 + 50, level.name, {
        fontFamily: 'Arial Black',
        fontSize: '28px',
        color: '#FFFFFF',
        align: 'center'
      }).setOrigin(0.5);
      card.add(title);
      
      // Mode icon (placeholder - would use actual icons)
      const icon = this.add.sprite(0, -30, `icon-${level.key}`)
        .setAlpha(0.7)
        .setScale(0.4)
        .setTint(0xFFFFFF);
      card.add(icon);
      
      // Mode description
      const desc = this.add.text(0, cardHeight/2 - 80, level.description, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#FFFFFF',
        align: 'center',
        wordWrap: { width: cardWidth - 30 }
      }).setOrigin(0.5);
      card.add(desc);
      
      // Play button
      const btnBg = this.add.rectangle(0, cardHeight/2 - 30, 140, 40, 0x000000, 0.6)
        .setStrokeStyle(2, 0xFFFFFF, i === this.selected ? 1 : 0.3);
      card.add(btnBg);
      
      const playText = this.add.text(0, cardHeight/2 - 30, 'LAUNCH', {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: i === this.selected ? '#FFE81F' : '#AAAAAA'
      }).setOrigin(0.5);
      card.add(playText);
      
      // Initial scale and alpha based on selection
      card.setScale(i === this.selected ? 1 : 0.85);
      card.setAlpha(i === this.selected ? 1 : 0.7);
      
      this.modeContainer.add(card);
      this.cards.push({ container: card, bg, title, icon, desc, btnBg, playText });
    }
  }
  
  createParticleEmitter() {
    // Create a particle texture
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('particleTexture_level', 8, 8);
    
    // Create emitter
    this.particles = this.add.particles(0, 0, 'particleTexture_level', {
      x: 0,
      y: 0,
      lifespan: 1000,
      speed: { min: 10, max: 30 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.5, end: 0 },
      blendMode: 'ADD',
      emitting: false
    });
    
    this.particles.setDepth(-0.5);
    this.modeContainer.add(this.particles);
    this.updateParticlePosition();
  }
  
  updateParticlePosition() {
    if (!this.particles || !this.cards[this.selected]) return;
    
    const selectedCard = this.cards[this.selected].container;
    
    // Update emitter position to current selection
    this.particles.setPosition(selectedCard.x, selectedCard.y);
    this.particles.emitting = true;
  }

  update() {
    // Animate starfield
    this.starfield.tilePositionY -= 0.5;

    // Handle navigation
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.selected = (this.selected + 1) % this.levels.length;
      this.animateCardTransition();
      this.updateParticlePosition();
    }
    
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.selected = (this.selected - 1 + this.levels.length) % this.levels.length;
      this.animateCardTransition();
      this.updateParticlePosition();
    }
    
    if (Phaser.Input.Keyboard.JustDown(this.enter)) {
      this.selectCurrentMode();
    }
  }

  animateCardTransition() {
    // Animate all cards to their new states
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i].container;
      const isSelected = i === this.selected;
      
      // Update card position considering the selected card should be centered
      let targetX = card.originalX;
      
      // Animate selection changes
      this.tweens.add({
        targets: card,
        scale: isSelected ? 1 : 0.85,
        alpha: isSelected ? 1 : 0.7,
        y: isSelected ? -10 : 0, // Selected card moves up slightly
        duration: 300,
        ease: 'Cubic.easeOut'
      });
      
      // Update visual elements
      this.cards[i].bg.setStrokeStyle(4, 0xFFFFFF, isSelected ? 1 : 0.3);
      this.cards[i].btnBg.setStrokeStyle(2, 0xFFFFFF, isSelected ? 1 : 0.3);
      this.cards[i].playText.setColor(isSelected ? '#FFE81F' : '#AAAAAA');
    }
    
    // Play selection sound
    // this.sound.play('select');
  }

  selectCurrentMode() {
    // Flash effect on selection
    this.cameras.main.flash(500, 255, 255, 255, 0.3);
    
    // Delay transition to show the flash effect
    this.time.delayedCall(300, () => {
      // Start the room selection scene with player name and selected level
      this.scene.start("roomselection", { 
        playerName: this.playerName, 
        level: this.levels[this.selected].key 
      });
    });
  }
}
