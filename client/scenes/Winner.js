import Phaser from "phaser";
import Constants from "../constants";
import starsBackground from "../assets/stars.png";

export default class Winner extends Phaser.Scene {
  init(data) {
    if (Array.isArray(data)) {
      // Legacy support
      this.players = data;
      this.roomName = "Game";
      this.gameMode = "classic";
      this.teamMode = false;
    } else {
      // New room-aware format
      this.players = data.players;
      this.roomName = data.roomName;
      this.gameMode = data.level || "classic";
      this.teamMode = data.winningTeam !== undefined;
      this.winningTeam = data.winningTeam;
      this.teamScores = data.teamScores;
    }
    
    this.enter = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );
    this.backspace = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.BACKSPACE
    );
  }

  preload() {
    this.load.image('stars', starsBackground);
  }

  create() {
    // Create starfield background
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'stars')
      .setOrigin(0)
      .setDepth(-1);

    // Create container for winner display
    const container = this.add.container(Constants.WIDTH / 2, Constants.HEIGHT / 2);
    
    // Add background panel
    const panel = this.add.rectangle(0, 0, Constants.WIDTH * 0.6, Constants.HEIGHT * 0.7, 0x000000, 0.8)
      .setStrokeStyle(4, 0xFFE81F);
    container.add(panel);
    
    // Create title with glow effect
    const titleText = `MISSION ACCOMPLISHED`;
    const title = this.add.text(0, -panel.height/2 + 50, titleText, {
      fontFamily: 'Arial Black',
      fontSize: '36px',
      color: '#FFE81F',
      align: 'center'
    }).setOrigin(0.5);
    container.add(title);

    // Add room name display
    const roomInfo = this.add.text(0, -panel.height/2 + 20, `ROOM: ${this.roomName}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#AAAAAA',
      align: 'center'
    }).setOrigin(0.5);
    container.add(roomInfo);

    // Handle winner announcement based on game mode
    if (this.teamMode) {
      this.createTeamWinnerDisplay(container, panel);
    } else {
      this.createIndividualWinnerDisplay(container, panel);
    }

    // Add instruction text
    const instruction = this.add.text(0, panel.height/2 - 50, 'Press ENTER to play again', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#AAAAAA',
      align: 'center'
    }).setOrigin(0.5);
    
    // Add blinking effect to instruction
    this.tweens.add({
      targets: instruction,
      alpha: 0.5,
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    
    container.add(instruction);

    // Add button to go back to room selection
    const backToRoomsButton = this.add.text(0, panel.height/2 - 20, 'Press BACKSPACE to return to room selection', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#AAAAAA',
      align: 'center'
    }).setOrigin(0.5);
    
    container.add(backToRoomsButton);

    // Add particles for celebratory effect - using Phaser 3.60+ approach
    const particleTexture = this.makeParticleTexture();
    
    this.add.particles(0, 0, particleTexture, {
      x: { min: 0, max: Constants.WIDTH },
      y: 0,
      lifespan: 4000,
      speedY: { min: 50, max: 100 },
      scale: { start: 0.5, end: 0.1 },
      quantity: 1,
      frequency: 200,
      blendMode: 'ADD',
      tint: [0xFFD700, 0x00FF00, 0x00FFFF]
    });
  }
  
  createIndividualWinnerDisplay(container, panel) {
    // Add winner annoucement with pulsing effect
    const winnerName = this.players[0].name;
    const winnerText = this.add.text(0, -panel.height/2 + 110, `${winnerName} RULES THE GALAXY!`, {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    container.add(winnerText);

    // Create pulsing effect for winner text
    this.tweens.add({
      targets: winnerText,
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1
    });

    // Add scoreboard title
    const scoreTitle = this.add.text(0, -panel.height/2 + 180, 'GALACTIC SCOREBOARD', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#00ff00',
      align: 'center'
    }).setOrigin(0.5);
    container.add(scoreTitle);

    // Add divider line
    const line = this.add.graphics();
    line.lineStyle(2, 0x00ff00, 1);
    line.lineBetween(-panel.width/2 + 50, -panel.height/2 + 210, panel.width/2 - 50, -panel.height/2 + 210);
    container.add(line);

    // Display scores with proper formatting
    let yPos = -panel.height/2 + 240;
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#FFFFFF'];
      const color = i < 3 ? rankColors[i] : rankColors[3];
      
      const rank = this.add.text(-panel.width/2 + 100, yPos, `${i+1}.`, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: color,
        align: 'right'
      }).setOrigin(0.5);
      
      const name = this.add.text(-panel.width/2 + 150, yPos, player.name, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: color,
        align: 'left'
      }).setOrigin(0, 0.5);
      
      const score = this.add.text(panel.width/2 - 100, yPos, `${player.score} pts`, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: color,
        align: 'right'
      }).setOrigin(1, 0.5);
      
      container.add([rank, name, score]);
      yPos += 40;
    }
  }
  
  createTeamWinnerDisplay(container, panel) {
    // Team winner announcement
    const teamColor = this.winningTeam === 'red' ? '#FF4444' : '#4444FF';
    const teamName = this.winningTeam.toUpperCase();
    
    const winnerTitle = this.add.text(0, -panel.height/2 + 110, `TEAM ${teamName} VICTORY!`, {
      fontFamily: 'Arial Black',
      fontSize: '32px',
      color: teamColor,
      align: 'center'
    }).setOrigin(0.5);
    container.add(winnerTitle);
    
    // Create pulsing effect for winner text
    this.tweens.add({
      targets: winnerTitle,
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1
    });
    
    // Show team scores
    const redScore = this.teamScores?.red || 0;
    const blueScore = this.teamScores?.blue || 0;
    
    const scoreDisplay = this.add.text(0, -panel.height/2 + 160, 
      `RED TEAM: ${redScore} - BLUE TEAM: ${blueScore}`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    container.add(scoreDisplay);
    
    // Add player scoreboard title
    const scoreTitle = this.add.text(0, -panel.height/2 + 210, 'PLAYER PERFORMANCE', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#00ff00',
      align: 'center'
    }).setOrigin(0.5);
    container.add(scoreTitle);
    
    // Add divider line
    const line = this.add.graphics();
    line.lineStyle(2, 0x00ff00, 1);
    line.lineBetween(-panel.width/2 + 50, -panel.height/2 + 240, panel.width/2 - 50, -panel.height/2 + 240);
    container.add(line);
    
    // Group players by team
    const redTeam = this.players.filter(p => p.team === 'red').sort((a, b) => b.score - a.score);
    const blueTeam = this.players.filter(p => p.team === 'blue').sort((a, b) => b.score - a.score);
    
    // Display team members with scores
    let yPos = -panel.height/2 + 280;
    
    // Red team header
    const redHeader = this.add.text(0, yPos, "RED TEAM", {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#FF4444',
      align: 'center'
    }).setOrigin(0.5);
    container.add(redHeader);
    yPos += 30;
    
    // Red team players
    for (let i = 0; i < redTeam.length; i++) {
      const player = redTeam[i];
      
      const name = this.add.text(-panel.width/2 + 150, yPos, player.name, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#FF9999',
        align: 'left'
      }).setOrigin(0, 0.5);
      
      const score = this.add.text(panel.width/2 - 100, yPos, `${player.score} pts`, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#FF9999',
        align: 'right'
      }).setOrigin(1, 0.5);
      
      container.add([name, score]);
      yPos += 30;
    }
    
    yPos += 10;
    
    // Blue team header
    const blueHeader = this.add.text(0, yPos, "BLUE TEAM", {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#4444FF',
      align: 'center'
    }).setOrigin(0.5);
    container.add(blueHeader);
    yPos += 30;
    
    // Blue team players
    for (let i = 0; i < blueTeam.length; i++) {
      const player = blueTeam[i];
      
      const name = this.add.text(-panel.width/2 + 150, yPos, player.name, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#9999FF',
        align: 'left'
      }).setOrigin(0, 0.5);
      
      const score = this.add.text(panel.width/2 - 100, yPos, `${player.score} pts`, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#9999FF',
        align: 'right'
      }).setOrigin(1, 0.5);
      
      container.add([name, score]);
      yPos += 30;
    }
  }
  
  // Helper method to create a particle texture
  makeParticleTexture() {
    // Create a small circular texture for particles
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(4, 4, 4);
    return graphics.generateTexture('particleTexture_winner', 8, 8);
  }
  
  update() {
    // Animate starfield
    this.starfield.tilePositionY -= 0.5;
    
    if (Phaser.Input.Keyboard.JustDown(this.enter)) {
      this.scene.start("playgame");
    } else if (Phaser.Input.Keyboard.JustDown(this.backspace)) {
      this.scene.start("roomselection");
    }
  }
}
