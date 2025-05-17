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
        color: 0x3498db,
        category: "Standard",
        difficulty: "Normal"
      },
      { 
        name: "Blackhole", 
        key: "blackhole", 
        description: "Navigate around a dangerous blackhole that pulls your ship. Collect powerups to gain advantages.",
        color: 0x9b59b6,
        category: "Challenge",
        difficulty: "Hard"
      },
      { 
        name: "Team Deathmatch", 
        key: "team", 
        description: "Join forces with other pilots! Red team vs Blue team in an epic space battle.",
        color: 0xe74c3c,
        category: "Multiplayer",
        difficulty: "Variable"
      },
      { 
        name: "Asteroid Field", 
        key: "asteroid", 
        description: "Dodge deadly asteroids while collecting coins. Extra points for shooting asteroids!",
        color: 0xf39c12,
        category: "Arcade",
        difficulty: "Medium"
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
    
    // Load custom WebFont
    this.load.script('webfont', 'https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js');
  }

  create() {
    // Handle potential errors with WebFont loading
    try {
      this.loadCustomFonts(() => {
        this.setupScene();
      });
    } catch (error) {
      console.warn("Error loading custom fonts:", error);
      // Fallback to immediately setting up scene if WebFont fails
      this.setupScene();
    }
  }
  
  loadCustomFonts(callback) {
    if (window.WebFont) {
      window.WebFont.load({
        google: {
          families: ['Exo 2:700,400', 'Rajdhani:500,700']
        },
        active: callback,
        inactive: callback
      });
    } else {
      // Fallback if WebFont fails to load
      callback();
    }
  }

  setupScene() {
    try {
      // Create animated starfield background with parallax layers
      this.createBackgroundLayers();
      
      // Create shader for background glow
      this.createBackgroundGlow();
      
      // Add header with player name and title
      this.createHeader();
      
      // Create container for game mode cards
      this.modeContainer = this.add.container(Constants.WIDTH/2, Constants.HEIGHT/2 + 30);
      
      // Create mode selection cards with improved visuals
      this.createModeCards();
      
      // Add navigation instructions with better styling
      this.createNavigationHelp();
      
      // Setup keyboard controls - Initialize cursors early to avoid undefined errors
      this.cursors = this.input.keyboard.createCursorKeys();
      this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.setupControls();
      
      // Add particles for active card - add as last to avoid rendering issues
      this.createParticleEmitter();
      
      // Add transition effects
      this.cameras.main.fadeIn(1000, 0, 0, 0);
      
      // Staggered animation for cards appearing
      this.animateCardsIn();
    } catch (error) {
      console.error("Error in setupScene:", error);
      // Provide fallback experience if something fails
      this.createFallbackScene();
    }
  }
  
  createFallbackScene() {
    // Simple fallback UI if the main setup fails
    this.add.rectangle(0, 0, Constants.WIDTH, Constants.HEIGHT, 0x000000, 1).setOrigin(0);
    
    this.add.text(Constants.WIDTH/2, 100, "MISSION SELECTION", {
      fontSize: '40px',
      fontFamily: 'Arial',
      color: '#FFE81F',
      align: 'center'
    }).setOrigin(0.5);
    
    this.add.text(Constants.WIDTH/2, 160, `COMMANDER ${this.playerName.toUpperCase()}`, {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    
    // Simple mode buttons
    const buttonY = 250;
    const spacing = 100;
    
    this.levels.forEach((level, index) => {
      const btn = this.add.rectangle(Constants.WIDTH/2, buttonY + (index * spacing), 300, 60, level.color, 0.8)
        .setInteractive()
        .on('pointerdown', () => {
          this.selected = index;
          this.selectCurrentMode();
        });
      
      this.add.text(Constants.WIDTH/2, buttonY + (index * spacing), level.name.toUpperCase(), {
        fontSize: '24px',
        fontFamily: 'Arial',
        color: '#FFFFFF'
      }).setOrigin(0.5);
    });
    
    // Add simple keyboard navigation
    this.cursors = this.input.keyboard.createCursorKeys();
    this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.selected = 0;
  }
  
  createBackgroundLayers() {
    // Main starfield layer (slower moving)
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'stars')
      .setOrigin(0)
      .setDepth(-10)
      .setAlpha(0.8);
      
    // Faster moving distant stars layer
    this.distantStars = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'stars')
      .setOrigin(0)
      .setDepth(-11)
      .setAlpha(0.5)
      .setTint(0x8888ff);
  }
  
  createBackgroundGlow() {
    // Add a custom shader that creates a subtle glow effect behind the selected card
    const rt = this.add.renderTexture(0, 0, Constants.WIDTH, Constants.HEIGHT).setDepth(-5);
    rt.fill(0x000000, 0);
    
    this.glowGraphics = this.add.graphics().setDepth(-5);
    
    // We'll update this glow position in the update loop
    this.updateGlowEffect();
  }
  
  updateGlowEffect() {
    if (!this.cards || !this.cards[this.selected]) return;
    
    this.glowGraphics.clear();
    
    const card = this.cards[this.selected].container;
    const globalX = this.modeContainer.x + card.x;
    const globalY = this.modeContainer.y + card.y;
    
    // Create radial gradient for glow effect
    this.glowGraphics.fillGradientStyle(
      this.levels[this.selected].color, 
      this.levels[this.selected].color, 
      0x000000, 
      0x000000, 
      0.3, 0.3, 0, 0
    );
    
    // Draw large circle for the glow effect
    this.glowGraphics.fillCircle(globalX, globalY, 280);
  }
  
  createHeader() {
    // Container for header elements
    const headerContainer = this.add.container(Constants.WIDTH/2, 0);
    
    // Background panel for header
    const headerBg = this.add.rectangle(0, 90, Constants.WIDTH * 0.8, 140, 0x000000, 0.5)
      .setStrokeStyle(2, 0xFFE81F, 0.8);
    headerContainer.add(headerBg);
    
    // Main title with custom font and effects
    const mainTitle = this.add.text(0, 55, `MISSION SELECTION`, {
      fontFamily: '"Exo 2", sans-serif',
      fontSize: '52px',
      fontWeight: 'bold',
      color: '#FFE81F',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 5, true);
    
    // Welcome message with player name and custom font
    const welcomeText = this.add.text(0, 105, `COMMANDER ${this.playerName.toUpperCase()}`, {
      fontFamily: '"Rajdhani", sans-serif',
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    
    // Instruction subtitle
    const instructionText = this.add.text(0, 135, `SELECT YOUR BATTLE MODE`, {
      fontFamily: '"Rajdhani", sans-serif',
      fontSize: '22px',
      color: '#AAAAAA',
    }).setOrigin(0.5);
    
    headerContainer.add([mainTitle, welcomeText, instructionText]);
    
    // Animate the title with a subtle float effect
    this.tweens.add({
      targets: mainTitle,
      y: '+=5',
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
  
  createModeCards() {
    this.cards = [];
    const cardWidth = 280;
    const cardHeight = 380;
    const padding = 60;
    const totalWidth = (cardWidth + padding) * this.levels.length;
    const startX = -(totalWidth / 2) + (cardWidth / 2);
    
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      const x = startX + i * (cardWidth + padding);
      
      // Create card container
      const card = this.add.container(x, 0);
      card.originalX = x;
      card.originalY = 0;
      
      // Card background with modern design
      const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x000000, 0.7)
        .setStrokeStyle(4, level.color, i === this.selected ? 1 : 0.3);
      
      // Add top accent bar
      const accentBar = this.add.rectangle(0, -cardHeight/2 + 15, cardWidth, 30, level.color, 0.8);
      
      // Mode title with custom font
      const title = this.add.text(0, -cardHeight/2 + 60, level.name.toUpperCase(), {
        fontFamily: '"Exo 2", sans-serif',
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center'
      }).setOrigin(0.5);
      
      // Category tag
      const categoryContainer = this.add.container(0, -cardHeight/2 + 100);
      const categoryBg = this.add.rectangle(0, 0, 140, 30, level.color, 0.6)
        .setStrokeStyle(1, 0xFFFFFF, 0.5);
      const categoryText = this.add.text(0, 0, level.category.toUpperCase(), {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center'
      }).setOrigin(0.5);
      categoryContainer.add([categoryBg, categoryText]);
      
      // Difficulty indicator
      const difficultyContainer = this.add.container(0, -cardHeight/2 + 135);
      const difficultyLabel = this.add.text(-50, 0, "DIFFICULTY:", {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '16px',
        color: '#AAAAAA',
        align: 'right'
      }).setOrigin(1, 0.5);
      
      // Create difficulty dots
      let difficultyColor;
      switch(level.difficulty) {
        case "Easy": difficultyColor = 0x2ecc71; break;
        case "Normal": difficultyColor = 0x3498db; break;
        case "Medium": difficultyColor = 0xf39c12; break;
        case "Hard": difficultyColor = 0xe74c3c; break;
        default: difficultyColor = 0x9b59b6; break;
      }
      
      const difficultyValue = this.add.text(0, 0, level.difficulty, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '16px',
        fontWeight: 'bold',
        color: this.rgbToHex(difficultyColor),
        align: 'left'
      }).setOrigin(0, 0.5);
      
      difficultyContainer.add([difficultyLabel, difficultyValue]);
      
      // Mode icon (placeholder - would use actual icons)
      const iconContainer = this.add.container(0, -10);
      const iconBg = this.add.circle(0, 0, 60, 0x000000, 0.5)
        .setStrokeStyle(2, level.color);
      const icon = this.add.sprite(0, 0, `icon-${level.key}`)
        .setAlpha(0.9)
        .setScale(0.4)
        .setTint(0xFFFFFF);
      
      // Add subtle rotation animation to icon
      this.tweens.add({
        targets: icon,
        angle: 360,
        duration: 20000,
        repeat: -1,
        ease: 'Linear'
      });
      
      iconContainer.add([iconBg, icon]);
      
      // Mode description with better text formatting
      const desc = this.add.text(0, cardHeight/2 - 130, level.description, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '18px',
        color: '#FFFFFF',
        align: 'center',
        wordWrap: { width: cardWidth - 40 },
        lineSpacing: 6
      }).setOrigin(0.5);
      
      // Play button with hover effect
      const btnContainer = this.add.container(0, cardHeight/2 - 40);
      const btnBg = this.add.rectangle(0, 0, 180, 50, level.color, 0.2)
        .setStrokeStyle(2, 0xFFFFFF, i === this.selected ? 1 : 0.3);
      
      const playText = this.add.text(0, 0, 'LAUNCH MISSION', {
        fontFamily: '"Exo 2", sans-serif',
        fontSize: '20px',
        fontWeight: 'bold',
        color: i === this.selected ? '#FFE81F' : '#AAAAAA'
      }).setOrigin(0.5);
      
      btnContainer.add([btnBg, playText]);
      
      // Make button interactive
      btnBg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          if (i === this.selected) {
            this.tweens.add({
              targets: btnBg,
              scaleX: 1.05,
              scaleY: 1.05,
              duration: 100
            });
            this.tweens.add({
              targets: playText,
              scaleX: 1.05,
              scaleY: 1.05,
              duration: 100
            });
          }
        })
        .on('pointerout', () => {
          this.tweens.add({
            targets: [btnBg, playText],
            scaleX: 1,
            scaleY: 1,
            duration: 100
          });
        })
        .on('pointerdown', () => {
          if (i === this.selected) {
            this.selectCurrentMode();
          } else {
            this.selected = i;
            this.animateCardTransition();
            this.updateParticlePosition();
          }
        });
      
      // Add all elements to card
      card.add([bg, accentBar, title, categoryContainer, difficultyContainer, iconContainer, desc, btnContainer]);
      
      // Initial scale and alpha based on selection
      card.setScale(i === this.selected ? 1 : 0.85);
      card.setAlpha(i === this.selected ? 1 : 0.7);
      
      // Initial position for entrance animation
      card.y = Constants.HEIGHT; // Start from bottom
      card.alpha = 0;
      
      this.modeContainer.add(card);
      this.cards.push({ 
        container: card, 
        bg, 
        accentBar,
        title, 
        categoryContainer,
        difficultyContainer,
        icon: iconContainer, 
        desc, 
        btnContainer, 
        btnBg, 
        playText 
      });
    }
  }
  
  animateCardsIn() {
    // Staggered animation for cards appearing
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i].container;
      
      this.tweens.add({
        targets: card,
        y: card.originalY,
        alpha: i === this.selected ? 1 : 0.7,
        scale: i === this.selected ? 1 : 0.85,
        duration: 800,
        delay: i * 150,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (i === this.selected) {
            // Add a subtle bounce effect to the selected card
            this.tweens.add({
              targets: card,
              y: card.originalY - 10,
              duration: 300,
              yoyo: true,
              ease: 'Sine.easeInOut'
            });
          }
        }
      });
    }
  }
  
  createNavigationHelp() {
    // Create a stylish navigation help panel
    const helpContainer = this.add.container(Constants.WIDTH/2, Constants.HEIGHT - 50);
    
    // Background panel
    const helpBg = this.add.rectangle(0, 0, 500, 50, 0x000000, 0.6)
      .setStrokeStyle(1, 0xFFE81F, 0.3);
    helpContainer.add(helpBg);
    
    // Controls text
    const controlsText = this.add.text(0, 0, 
      '← → : Navigate | ENTER : Select | MOUSE : Click to Select', {
      fontFamily: '"Rajdhani", sans-serif',
      fontSize: '18px',
      color: '#CCCCCC'
    }).setOrigin(0.5);
    helpContainer.add(controlsText);
    
    // Pulse animation for help panel
    this.tweens.add({
      targets: helpContainer,
      alpha: 0.7,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
  
  createParticleEmitter() {
    try {
      // Create a particle texture
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture('particleTexture_level', 8, 8);
      
      // Create compatible particle emitter based on Phaser version
      // Using a more compatible approach to handle different Phaser versions
      if (Phaser.VERSION.startsWith('3.5') || Phaser.VERSION.startsWith('3.6') || 
          Phaser.VERSION.startsWith('3.7')) {
        // Older versions (3.5x - 3.7x) used ParticleEmitterManager
        this.particles = this.add.particles('particleTexture_level');
        this.emitter = this.particles.createEmitter({
          x: 0,
          y: 0,
          lifespan: { min: 600, max: 1500 },
          speed: { min: 10, max: 50 },
          scale: { start: 0.5, end: 0 },
          alpha: { start: 0.5, end: 0 },
          // Use array of colors instead of tint
          tint: [0xFFFFFF, 0xFFE81F, 0x3498db, 0x9b59b6, 0xe74c3c, 0xf39c12],
          blendMode: 'ADD',
          quantity: 2,
          on: false // start not emitting
        });
        
      } else {
        // Newer versions (3.8+) use ParticleEmitter directly
        this.particles = this.add.particles({
          key: 'particleTexture_level',
          config: {
            x: 0,
            y: 0,
            lifespan: { min: 600, max: 1500 },
            speed: { min: 10, max: 50 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.5, end: 0 },
            blendMode: 'ADD',
            emitting: false,
            quantity: 2
          }
        });
        
        // Store the current level color to use for particles
        this.particleColor = this.levels[this.selected].color;
        
        // For newer versions, we'll use the emitting property directly
        this.particles.setPosition(0, 0);
        this.particles.setDepth(-0.5);
      }
      
      // Add particles to the container with the cards
      if (this.modeContainer) {
        this.modeContainer.add(this.particles);
      }
      
      // Initial particle position update
      this.updateParticlePosition();
      
    } catch (error) {
      console.error("Error creating particle emitter:", error);
      // If particles fail, we'll continue without them
      this.particles = null;
    }
  }
  
  setupControls() {
    // Don't reassign cursors here since we already initialized it
    // this.cursors = this.input.keyboard.createCursorKeys();
    // this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    
    // Add mouse wheel navigation
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (deltaY > 0) {
        this.selected = (this.selected + 1) % this.levels.length;
        this.animateCardTransition();
        this.updateParticlePosition();
      } else if (deltaY < 0) {
        this.selected = (this.selected - 1 + this.levels.length) % this.levels.length;
        this.animateCardTransition();
        this.updateParticlePosition();
      }
    });
    
    // Swipe navigation for mobile
    this.input.on('pointerdown', (pointer) => {
      this.startPointerX = pointer.x;
    });
    
    this.input.on('pointerup', (pointer) => {
      if (this.startPointerX) {
        const swipeDistance = pointer.x - this.startPointerX;
        if (Math.abs(swipeDistance) > 50) {
          if (swipeDistance > 0) {
            this.selected = (this.selected - 1 + this.levels.length) % this.levels.length;
          } else {
            this.selected = (this.selected + 1) % this.levels.length;
          }
          this.animateCardTransition();
          this.updateParticlePosition();
        }
        this.startPointerX = null;
      }
    });
  }
  
  updateParticlePosition() {
    try {
      if (!this.particles || !this.cards || !this.cards[this.selected]) return;
      
      const selectedCard = this.cards[this.selected].container;
      const color = this.levels[this.selected].color;
      
      // Handle different versions of Phaser
      if (this.emitter) {
        // Older Phaser versions (ParticleEmitterManager)
        this.emitter.setPosition(selectedCard.x, selectedCard.y);
        
        // Need to find the right approach to tint for this version
        try {
          this.emitter.setTint(color);
        } catch (e) {
          // If direct tinting fails, try other approaches
          try {
            this.emitter.tint.onChange(color);
          } catch (e2) {
            // If all tinting attempts fail, continue without tinting
            console.warn("Could not set particle tint", e2);
          }
        }
        
        this.emitter.start();
      } else if (this.particles) {
        // Newer Phaser versions
        this.particles.setPosition(selectedCard.x, selectedCard.y);
        
        // Store current color
        this.particleColor = color;
        
        // Start emitting particles
        this.particles.emitting = true;
      }
      
      // Update glow effect
      this.updateGlowEffect();
    } catch (error) {
      console.warn("Error updating particle position:", error);
      // If updating particles fails, disable them
      this.particles = null;
    }
  }

  update() {
    try {
      // Check if starfield exists before updating it
      if (this.starfield) {
        this.starfield.tilePositionY -= 0.5;
      }
      
      if (this.distantStars) {
        this.distantStars.tilePositionY -= 0.8;
      }

      // Make sure cursors is defined before using it
      if (this.cursors) {
        // Handle keyboard navigation
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
        
        if (this.enter && Phaser.Input.Keyboard.JustDown(this.enter)) {
          this.selectCurrentMode();
        }
      }
      
      // Tint particles in update loop if needed
      if (this.particles && this.particleColor && !this.emitter) {
        // Modern particles don't have setTint but can use tint array in config
        // We'll just recreate the emitter with the new color if needed
      }
    } catch (error) {
      console.error("Error in update loop:", error);
    }
  }

  animateCardTransition() {
    // Animate all cards to their new states
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i].container;
      const isSelected = i === this.selected;
      
      // Update visual elements
      this.cards[i].bg.setStrokeStyle(4, this.levels[i].color, isSelected ? 1 : 0.3);
      this.cards[i].btnBg.setStrokeStyle(2, 0xFFFFFF, isSelected ? 1 : 0.3);
      this.cards[i].playText.setColor(isSelected ? '#FFE81F' : '#AAAAAA');
      
      // Animate selection changes
      this.tweens.add({
        targets: card,
        scale: isSelected ? 1 : 0.85,
        alpha: isSelected ? 1 : 0.7,
        y: isSelected ? -20 : 0, // Selected card moves up
        duration: 300,
        ease: 'Back.easeOut'
      });
      
      // Add subtle pulse effect to the selected card
      if (isSelected) {
        this.tweens.add({
          targets: this.cards[i].accentBar,
          alpha: 0.6,
          yoyo: true,
          repeat: 1,
          duration: 300
        });
      }
    }
    
    // Play selection sound (uncomment when you have sound assets)
    // this.sound.play('select', { volume: 0.5 });
  }

  selectCurrentMode() {
    // Disable controls during transition
    this.cursors.left.reset();
    this.cursors.right.reset();
    this.enter.reset();
    
    // Flash effect on selection
    this.cameras.main.flash(500, 255, 255, 255, 0.3);
    
    // Zoom effect on the selected card
    const selectedCard = this.cards[this.selected].container;
    this.tweens.add({
      targets: selectedCard,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeIn'
    });
    
    // Fade out other cards
    for (let i = 0; i < this.cards.length; i++) {
      if (i !== this.selected) {
        this.tweens.add({
          targets: this.cards[i].container,
          alpha: 0,
          duration: 400,
          ease: 'Cubic.easeIn'
        });
      }
    }
    
    // Delay transition to show the effects
    this.time.delayedCall(800, () => {
      // Start the room selection scene with player name and selected level
      this.scene.start("roomselection", { 
        playerName: this.playerName, 
        level: this.levels[this.selected].key 
      });
    });
  }
  
  // Helper function to convert RGB to hex color string
  rgbToHex(color) {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}
