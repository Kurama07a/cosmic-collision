import Phaser from "phaser";
import Constants from "../constants";
import SuperGalacticaMusic from "../assets/Super Galaxtica.mp3";
import starsBackground from "../assets/Space.png";

export default class Welcome extends Phaser.Scene {
  init() {
    // Register keyboard input for name entry (will be used after intro)
    var alpha = "abcdefghijklmnopqrstuvwxyz0123456789".split("").join(",");
    this.keys = this.input.keyboard.addKeys(alpha);
    this.backspace = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.BACKSPACE
    );
    this.enter = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );
    this.space = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    
    this.introComplete = false;
    this.name = "";
  }

  preload() {
    this.load.audio('theme', SuperGalacticaMusic);
    this.load.image('space', starsBackground);
  }

  create() {
    // Create starfield background
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'space')
      .setOrigin(0)
      .setDepth(-1);
    
    // Add ambient particles for space dust effect - using Phaser 3.60+ approach
    // Create small white dots for stars/dust
    const particleTexture = this.makeParticleTexture();
    
    // Create particle emitter for space dust
    const emitter = this.add.particles(0, 0, particleTexture, {
      x: { min: 0, max: Constants.WIDTH },
      y: 0,
      lifespan: 6000,
      speedY: { min: 20, max: 50 },
      scale: { start: 0.5, end: 0.1 },
      quantity: 1,
      frequency: 500,
      blendMode: 'ADD',
      alpha: { start: 0.5, end: 0 }
    });

    // Add the logo
    this.logo = this.add.text(Constants.WIDTH/2, Constants.HEIGHT/2 - 100, 'COSMIC COLLISION', {
      fontFamily: 'Arial Black',
      fontSize: '84px',
      color: '#FFE81F',
      stroke: '#000000',
      strokeThickness: 8,
      align: 'center'
    }).setOrigin(0.5).setAlpha(0);

    // Start background music
    this.music = this.sound.add('theme', { loop: true, volume: 0.6 });
    this.music.play();

    // Fade in the logo
    this.tweens.add({
      targets: this.logo,
      alpha: 1,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => {
        // Zoom and fade out the logo
        this.tweens.add({
          targets: this.logo,
          scaleX: 0.1,
          scaleY: 0.1,
          alpha: 0,
          duration: 2000,
          ease: 'Power2',
          onComplete: () => this.startCrawl()
        });
      }
    });
  }

  // Helper method to create a particle texture
  makeParticleTexture() {
    // Create a small circular texture for particles
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(4, 4, 4);
    return graphics.generateTexture('particleTexture', 8, 8);
  }

  startCrawl() {
    // Create the Star Wars style text crawl
    const crawlContent = 
      "EPISODE I\n\n" +
      "THE GALACTIC COIN WARS\n\n" +
      "SPACE IS BANKRUPT! After blowing the galactic budget on Death Stars nobody asked for, the Empire is desperately collecting loose change across the universe.\n\n" +
      "Some genius accountant discovered that ancient 'SpaceBucks' are worth a fortune, despite looking suspiciously like chocolate coins wrapped in gold foil.\n\n" +
      "The Emperor, who definitely isn't compensating for something, promises ULTIMATE COSMIC POWER to whoever collects 100 coins first.\n\n" +
      "YOUR MISSION: As the galaxy's least qualified pilot, navigate your ship (actually just a repurposed food delivery drone) through space junk while avoiding enemy lasers.\n\n" +
      "WARNING: Your spacecraft warranty is void if hit by asteroids, lasers, space dust, or mean looks from passing aliens.\n\n" +
      "The Galactic Insurance Company reminds you: In space, no one can hear you file a claim.\n\n" +
      "May the Funds be with you...\n\n";

    // Create a container to hold all text
    this.crawlContainer = this.add.container(Constants.WIDTH/2, Constants.HEIGHT + 100);

    // Create text with proper formatting for the crawl
    this.crawlText = this.add.text(0, 0, crawlContent, {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#FFE81F',
      align: 'center',
      wordWrap: { width: Constants.WIDTH * 0.8 }
    }).setOrigin(0.5, 0);
    
    // Rest of the method remains the same...
    
    // Add to container
    this.crawlContainer.add(this.crawlText);
    
    // Animate the crawl
    this.tweens.add({
      targets: this.crawlContainer,
      y: -this.crawlText.height - Constants.HEIGHT,
      scaleX: 0.25,
      scaleY: 0.25,
      duration: 35000, // Increased from 20000 to 35000 for slower text scrolling
      ease: 'Linear',
      onUpdate: (tween, target) => {
        // Create perspective effect
        const progress = tween.progress;
        this.crawlContainer.setY(Constants.HEIGHT + 200 - (Constants.HEIGHT * 2 + this.crawlText.height) * progress);
        const scale = 1 - 0.75 * progress;
        this.crawlContainer.setScale(scale);
        
        // Flash light effects occasionally
        if (Phaser.Math.Between(0, 500) === 1) {
          this.flashLightEffect();
        }
        
        // If we're near the end, show the "continue" prompt
        if (progress > 0.50 && !this.continuePrompt) {
          this.showContinuePrompt();
        }
      },
      onComplete: () => {
        this.showNameEntry();
      }
    });

    // Skip button prompt - make more visible from the start
    this.skipText = this.add.text(Constants.WIDTH - 20, Constants.HEIGHT - 30, 'Press SPACE to skip', {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    }).setOrigin(1, 0.5);
    
    // Fade in skip text faster
    this.tweens.add({
      targets: this.skipText,
      alpha: 1,
      duration: 500,
      ease: 'Power2'
    });
  }
  
  flashLightEffect() {
    // Create a flashing light effect that simulates a lens flare
    const flash = this.add.circle(
      Phaser.Math.Between(0, Constants.WIDTH),
      Phaser.Math.Between(0, Constants.HEIGHT / 2),
      Phaser.Math.Between(50, 150),
      0xFFFFFF, 0.1
    );
    
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 3,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        flash.destroy();
      }
    });
  }

  showContinuePrompt() {
    this.continuePrompt = true;
    
    // Add a "Press ENTER to continue" text at the bottom
    const continueText = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT - 50, 
      'Press ENTER to continue', 
      {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#FFE81F',
        backgroundColor: '#000000',
        padding: { x: 15, y: 8 }
      }
    ).setOrigin(0.5, 0.5);
    
    // Add pulsing animation
    this.tweens.add({
      targets: continueText,
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1
    });
    
    // Allow pressing ENTER to continue
    const enterKey = this.input.keyboard.addKey('ENTER');
    enterKey.on('down', () => {
      if (this.continuePrompt && !this.introComplete) {
        this.tweens.killTweensOf(this.crawlContainer);
        this.showNameEntry();
      }
    });
  }

  showNameEntry() {
    // Hide the crawl and clean up
    if (this.crawlContainer) this.crawlContainer.destroy();
    if (this.skipText) this.skipText.destroy();
    
    // Show the name entry interface
    this.nameEntryBackground = this.add.rectangle(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2, 
      Constants.WIDTH * 0.6, 
      Constants.HEIGHT * 0.4, 
      0x000000, 0.7
    ).setOrigin(0.5);
    
    this.welcomeTitle = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2 - 100, 
      'YOUR MISSION BEGINS', 
      {
        fontFamily: 'Arial Black',
        fontSize: '40px',
        color: '#FFE81F',
        align: 'center'
      }
    ).setOrigin(0.5);
    
    this.welcomeText = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2 - 40, 
      'Enter your pilot name:', 
      {
        fontSize: '24px',
        color: '#FFFFFF',
        align: 'center'
      }
    ).setOrigin(0.5);
    
    this.nameText = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2 + 20, 
      '', 
      {
        fontSize: '36px',
        color: '#00FF00',
        align: 'center'
      }
    ).setOrigin(0.5);
    
    this.instructionText = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2 + 80, 
      'Press ENTER when ready for battle', 
      {
        fontSize: '18px',
        color: '#AAAAAA',
        align: 'center'
      }
    ).setOrigin(0.5);
    
    // Add blinking cursor effect
    this.cursor = this.add.text(
      Constants.WIDTH / 2, 
      Constants.HEIGHT / 2 + 20, 
      '|', 
      { fontSize: '36px', color: '#00FF00' }
    ).setOrigin(0, 0.5);
    
    // Animate the cursor blinking
    this.tweens.add({
      targets: this.cursor,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1
    });
    
    this.introComplete = true;
  }

  update() {
    // Animate starfield
    this.starfield.tilePositionY -= 0.5;

    // Skip intro if space is pressed
    if (!this.introComplete) {
      if (Phaser.Input.Keyboard.JustDown(this.space)) {
        // Stop any running tweens on the crawl
        this.tweens.killTweensOf(this.crawlContainer);
        this.showNameEntry();
      }
    }

    // Only process keyboard input after intro is complete
    if (this.introComplete) {
      // Process typing
      for (const key of Object.keys(this.keys)) {
        if (Phaser.Input.Keyboard.JustDown(this.keys[key])) {
          if (this.name.length < 15) {
            this.name += key;
          }
        }
      }
      
      // Handle backspace
      if (Phaser.Input.Keyboard.JustDown(this.backspace)) {
        this.name = this.name.substring(0, this.name.length - 1);
      }
      
      // Update name display
      this.nameText.setText(this.name);
      this.cursor.setPosition(
        Constants.WIDTH / 2 + (this.nameText.width / 2) + 5,
        Constants.HEIGHT / 2 + 20
      );
      
      // Start game on enter if name is not empty
      if (Phaser.Input.Keyboard.JustDown(this.enter) && this.name.trim().length > 0) {
        this.music.stop();
        // Change this line to go to room selection instead of directly to the game
        this.scene.start("roomselection", this.name);
      }
    }
  }
}
