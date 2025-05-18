import Phaser from "phaser";
import Constants from "../constants";
import io from "socket.io-client";
import starsBackground from "../assets/stars.png";

export default class RoomSelection extends Phaser.Scene {
  constructor() {
    super("roomselection");
    this.rooms = [];
    this.selectedRoomIndex = -1;
    this.showCreateRoomForm = false;
  }

  init(data) {
    // Accept both string (legacy) and object (new)
    if (typeof data === "string") {
      this.playerName = data;
      this.selectedLevel = "classic";
    } else {
      this.playerName = data.playerName;
      this.selectedLevel = data.level || "classic";
    }
    
    // Initialize team selection for team mode
    if (this.selectedLevel === "team") {
      this.selectedTeam = "red"; // Default team
    }
    
    // Determine endpoint
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "192.168.77.84:5000";
    } else {
      this.ENDPOINT = "192.168.77.84:5000";
    }

    // Initialize input keys
    this.cursors = this.input.keyboard.createCursorKeys();
    this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escape = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.createKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
  }

  preload() {
    this.load.image('space', starsBackground);
  }

  create() {
    this.socket = io(this.ENDPOINT);

    // Create starfield background
    this.starfield = this.add.tileSprite(0, 0, Constants.WIDTH, Constants.HEIGHT, 'space')
      .setOrigin(0)
      .setDepth(-1);

    // Create UI container
    this.container = this.add.container(Constants.WIDTH / 2, Constants.HEIGHT / 2);
    
    // Add background panel
    this.panel = this.add.rectangle(0, 0, Constants.WIDTH * 0.8, Constants.HEIGHT * 0.8, 0x000000, 0.8)
      .setStrokeStyle(4, 0xFFE81F);
    this.container.add(this.panel);
    
    // Add room selection title with game mode
    const modeName = this.getGameModeName(this.selectedLevel);
    this.title = this.add.text(0, -this.panel.height / 2 + 40, `${modeName.toUpperCase()} - ROOM SELECTION`, {
      fontFamily: 'Arial Black',
      fontSize: '36px',
      color: '#FFE81F',
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.title);
    
    // Team selection UI for Team Deathmatch mode
    if (this.selectedLevel === "team") {
      this.createTeamSelector();
    }
    
    // Welcome message with player name
    this.welcomeMessage = this.add.text(0, -this.panel.height / 2 + 90, `Welcome, ${this.playerName}!`, {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.welcomeMessage);
    
    // Instructions text
    this.instructions = this.add.text(0, -this.panel.height / 2 + 130, 'Select a room to join or create your own', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#AAAAAA',
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.instructions);

    // Create room list container
    this.roomListContainer = this.add.container(0, 0);
    this.container.add(this.roomListContainer);
    
    // Footer with controls info
    const controlsText = this.selectedLevel === "team" 
      ? 'UP/DOWN: Navigate | ENTER: Join Room | C: Create Room | T: Switch Team'
      : 'UP/DOWN: Navigate | ENTER: Join Room | C: Create Room';
    
    this.controls = this.add.text(0, this.panel.height / 2 - 40, controlsText, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#AAAAAA',
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.controls);
    
    // Loading text (shown while waiting for room list)
    this.loadingText = this.add.text(0, 0, 'Loading rooms...', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#FFFFFF',
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.loadingText);
    
    // Create form elements (initially hidden)
    this.createRoomForm();
    
    // Listen for room list updates
    this.socket.on("available_rooms", (rooms) => {
      this.rooms = rooms;
      this.updateRoomList();
      this.loadingText.setVisible(false);
    });
    
    // Listen for room creation confirmation
    this.socket.on("room_created", ({ roomId }) => {
      this.joinRoom(roomId);
    });
    
    // Request rooms when scene starts
    this.socket.emit("available_rooms");
    
    // Handle mouse input for room selection
    this.input.on('pointerdown', (pointer) => {
      if (this.showCreateRoomForm) {
        // Check if clicking outside the form to cancel
        const bounds = new Phaser.Geom.Rectangle(
          Constants.WIDTH / 2 - this.formPanel.width / 2,
          Constants.HEIGHT / 2 - this.formPanel.height / 2,
          this.formPanel.width,
          this.formPanel.height
        );
        
        if (!bounds.contains(pointer.x, pointer.y)) {
          this.toggleCreateRoomForm(false);
        }
      }
    });
    
    // Add key for team switching in team mode
    if (this.selectedLevel === "team") {
      this.teamKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    }
  }
  
  // Helper method to get friendly name of game mode
  getGameModeName(level) {
    switch(level) {
      case "classic": return "Classic";
      case "blackhole": return "Blackhole";
      case "team": return "Team Deathmatch";
      case "asteroid": return "Asteroid Field";
      default: return "Unknown Mode";
    }
  }
  
  // Create team selection UI
  createTeamSelector() {
    this.teamSelectorContainer = this.add.container(0, -this.panel.height / 2 + 180);
    
    // Label
    const teamLabel = this.add.text(-100, 0, "YOUR TEAM:", {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    });
    
    // Red team button
    this.redTeamBtn = this.add.container(0, 0);
    const redBg = this.add.rectangle(0, 0, 80, 30, 0x880000);
    redBg.setStrokeStyle(3, 0xFF0000, this.selectedTeam === 'red' ? 1 : 0.3);
    const redText = this.add.text(0, 0, "RED", {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.redTeamBtn.add([redBg, redText]);
    this.redTeamBtn.setInteractive(new Phaser.Geom.Rectangle(-40, -15, 80, 30), Phaser.Geom.Rectangle.Contains);
    
    // Blue team button
    this.blueTeamBtn = this.add.container(100, 0);
    const blueBg = this.add.rectangle(0, 0, 80, 30, 0x000088);
    blueBg.setStrokeStyle(3, 0x0000FF, this.selectedTeam === 'blue' ? 1 : 0.3);
    const blueText = this.add.text(0, 0, "BLUE", {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.blueTeamBtn.add([blueBg, blueText]);
    this.blueTeamBtn.setInteractive(new Phaser.Geom.Rectangle(-40, -15, 80, 30), Phaser.Geom.Rectangle.Contains);
    
    // Team selection handlers
    this.redTeamBtn.on('pointerdown', () => this.selectTeam('red'));
    this.blueTeamBtn.on('pointerdown', () => this.selectTeam('blue'));
    
    this.teamSelectorContainer.add([teamLabel, this.redTeamBtn, this.blueTeamBtn]);
    this.container.add(this.teamSelectorContainer);
  }
  
  selectTeam(team) {
    this.selectedTeam = team;
    
    // Update UI
    if (this.redTeamBtn && this.blueTeamBtn) {
      this.redTeamBtn.list[0].setStrokeStyle(3, 0xFF0000, team === 'red' ? 1 : 0.3);
      this.blueTeamBtn.list[0].setStrokeStyle(3, 0x0000FF, team === 'blue' ? 1 : 0.3);
    }
  }
  
  createRoomForm() {
    // Form container
    this.formContainer = this.add.container(0, 0);
    this.formContainer.setVisible(false);
    
    // Form background - increase width by 30%
    this.formPanel = this.add.rectangle(0, 0, 520, 300, 0x000000, 0.9)
      .setStrokeStyle(2, 0xFFE81F);
    this.formContainer.add(this.formPanel);
    
    // Form title
    this.formTitle = this.add.text(0, -this.formPanel.height / 2 + 30, 'CREATE CUSTOM ROOM', {
      fontFamily: 'Arial Black',
      fontSize: '24px',
      color: '#FFE81F',
      align: 'center'
    }).setOrigin(0.5);
    this.formContainer.add(this.formTitle);
    
    // Room name input - adjust position to account for wider form
    this.nameLabel = this.add.text(-200, -40, 'Room Name:', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    }).setOrigin(0, 0.5);
    this.formContainer.add(this.nameLabel);
    
    // Make input field wider to match new form width
    this.nameInputBackground = this.add.rectangle(50, -40, 250, 30, 0x333333)
      .setStrokeStyle(1, 0x666666);
    this.formContainer.add(this.nameInputBackground);
    
    this.nameInputText = this.add.text(0, -40, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF',
      align: 'left'
    }).setOrigin(0.5);
    this.formContainer.add(this.nameInputText);
    
    // Max players selector - adjust position
    this.maxPlayersLabel = this.add.text(-200, 20, 'Max Players:', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    }).setOrigin(0, 0.5);
    this.formContainer.add(this.maxPlayersLabel);
    
    this.maxPlayersValue = 4; // Default value
    
    this.maxPlayersText = this.add.text(50, 20, this.maxPlayersValue.toString(), {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.formContainer.add(this.maxPlayersText);
    
    this.decreaseBtn = this.add.text(10, 20, '◀', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#FFE81F'
    }).setOrigin(0.5).setInteractive();
    this.formContainer.add(this.decreaseBtn);
    
    this.increaseBtn = this.add.text(90, 20, '▶', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#FFE81F'
    }).setOrigin(0.5).setInteractive();
    this.formContainer.add(this.increaseBtn);
    
    // Create button
    this.createButton = this.add.rectangle(0, 80, 200, 40, 0x225522)
      .setStrokeStyle(2, 0x33FF33);
    this.formContainer.add(this.createButton);
    
    this.createButtonText = this.add.text(0, 80, 'CREATE ROOM', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.formContainer.add(this.createButtonText);
    
    // Cancel button
    this.cancelButton = this.add.rectangle(0, 130, 200, 40, 0x552222)
      .setStrokeStyle(2, 0xFF3333);
    this.formContainer.add(this.cancelButton);
    
    this.cancelButtonText = this.add.text(0, 130, 'CANCEL', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.formContainer.add(this.cancelButtonText);
    
    // Make buttons interactive
    this.createButton.setInteractive();
    this.cancelButton.setInteractive();
    
    // Set up event listeners
    this.decreaseBtn.on('pointerdown', () => {
      this.maxPlayersValue = Math.max(2, this.maxPlayersValue - 1);
      this.maxPlayersText.setText(this.maxPlayersValue.toString());
    });
    
    this.increaseBtn.on('pointerdown', () => {
      this.maxPlayersValue = Math.min(8, this.maxPlayersValue + 1);
      this.maxPlayersText.setText(this.maxPlayersValue.toString());
    });
    
    this.createButton.on('pointerdown', () => {
      this.createRoom();
    });
    
    this.cancelButton.on('pointerdown', () => {
      this.toggleCreateRoomForm(false);
    });
    
    // Name input interaction
    this.nameInputBackground.setInteractive();
    this.nameInputBackground.on('pointerdown', () => {
      this.input.keyboard.off('keydown');
      this.input.keyboard.on('keydown', (event) => {
        if (event.keyCode === 8 && this.roomName && this.roomName.length > 0) {
          // Backspace - remove last character
          this.roomName = this.roomName.slice(0, -1);
        } else if (event.keyCode === 13) {
          // Enter - confirm name
          this.input.keyboard.off('keydown');
        } else if ((event.keyCode >= 65 && event.keyCode <= 90) || 
                   (event.keyCode >= 48 && event.keyCode <= 57) ||
                   event.keyCode === 32) {
          // Letters, numbers and space
          if (!this.roomName) this.roomName = '';
          if (this.roomName.length < 20) {
            this.roomName += event.key;
          }
        }
        
        this.nameInputText.setText(this.roomName || '');
      });
    });
    
    this.add.existing(this.formContainer);
  }

  toggleCreateRoomForm(show = true) {
    this.showCreateRoomForm = show;
    this.formContainer.setVisible(show);
    this.container.setVisible(!show);
    
    if (show) {
      // Position the form container in the center of the screen
      this.formContainer.setPosition(Constants.WIDTH / 2, Constants.HEIGHT / 2);
      
      this.roomName = `${this.playerName}'s Room`;
      this.nameInputText.setText(this.roomName);
      this.maxPlayersValue = 4;
      this.maxPlayersText.setText(this.maxPlayersValue.toString());
    }
  }
  
  createRoom() {
    const name = this.roomName || `${this.playerName}'s Room`;
    this.socket.emit("create_room", { 
      name, 
      maxPlayers: this.maxPlayersValue 
    });
  }
  
  joinRoom(roomId) {
    const joinData = { 
      roomId, 
      name: this.playerName
    };
    
    // Add team for team mode
    if (this.selectedLevel === "team") {
      joinData.team = this.selectedTeam;
    }
    
    this.socket.emit("join_room", joinData, (response) => {
      if (response.success) {
        // Store socket for the game scene
        window.gameSocket = this.socket;
        // Start the game with the player's name and room info
        this.scene.start("playgame", { 
          playerName: this.playerName,
          roomId: response.roomId,
          roomName: response.roomName,
          level: this.selectedLevel,
          team: this.selectedTeam // Include team for team mode
        });
      } else {
        this.showErrorMessage(response.message);
      }
    });
  }
  
  showErrorMessage(message) {
    if (this.errorMessage) {
      this.errorMessage.destroy();
    }
    
    this.errorMessage = this.add.text(0, this.panel.height / 2 - 80, message, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#FF3333',
      align: 'center'
    }).setOrigin(0.5);
    
    this.container.add(this.errorMessage);
    
    this.time.delayedCall(3000, () => {
      if (this.errorMessage) {
        this.errorMessage.destroy();
        this.errorMessage = null;
      }
    });
  }
  
  updateRoomList() {
    // Clear current room list
    this.roomListContainer.removeAll();
    
    if (this.rooms.length === 0) {
      const noRoomsText = this.add.text(0, 0, 'No rooms available. Create one!', {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#AAAAAA',
        align: 'center'
      }).setOrigin(0.5);
      
      this.roomListContainer.add(noRoomsText);
      return;
    }
    
    // Create room list header
    const headerBg = this.add.rectangle(0, -this.panel.height / 2 + 180, this.panel.width - 100, 40, 0x333333);
    this.roomListContainer.add(headerBg);
    
    const idHeader = this.add.text(-headerBg.width / 2 + 30, -this.panel.height / 2 + 180, 'ROOM', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFE81F',
      align: 'left'
    }).setOrigin(0, 0.5);
    
    const nameHeader = this.add.text(-120, -this.panel.height / 2 + 180, 'NAME', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFE81F',
      align: 'left'
    }).setOrigin(0, 0.5);
    
    const playersHeader = this.add.text(headerBg.width / 2 - 120, -this.panel.height / 2 + 180, 'PLAYERS', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#FFE81F',
      align: 'center'
    }).setOrigin(0.5);
    
    this.roomListContainer.add([idHeader, nameHeader, playersHeader]);
    
    // Add room items
    let yOffset = -this.panel.height / 2 + 230;
    const itemHeight = 40;
    
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const isSelected = i === this.selectedRoomIndex;
      
      // Room item background
      const bg = this.add.rectangle(
        0, 
        yOffset, 
        headerBg.width, 
        itemHeight, 
        isSelected ? 0x335577 : (i % 2 === 0 ? 0x222222 : 0x282828)
      );
      
      if (isSelected) {
        bg.setStrokeStyle(2, 0x3399FF);
      }
      
      bg.setInteractive();
      bg.roomIndex = i; // Store reference to room index
      
      // Add click handler
      bg.on('pointerdown', () => {
        this.selectedRoomIndex = i;
        this.updateRoomList();
      });
      
      bg.on('pointerup', () => {
        if (this.selectedRoomIndex === i) {
          this.joinRoom(room.id);
        }
      });
      
      // Room ID or type
      const idText = room.id === "main" ? 
        "LOBBY" : 
        `ROOM #${room.id.substring(0, 6)}`;
      
      const id = this.add.text(
        -headerBg.width / 2 + 30, 
        yOffset, 
        idText, 
        {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: room.id === "main" ? '#00FF00' : '#FFFFFF',
          align: 'left'
        }
      ).setOrigin(0, 0.5);
      
      // Room name
      const name = this.add.text(
        -120, 
        yOffset, 
        room.name, 
        {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: '#FFFFFF',
          align: 'left'
        }
      ).setOrigin(0, 0.5);
      
      // Player count
      const playerCount = room.id === "main" ? 
        `${room.playerCount} / ∞` : 
        `${room.playerCount} / ${room.maxPlayers}`;
      
      const players = this.add.text(
        headerBg.width / 2 - 120, 
        yOffset, 
        playerCount, 
        {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: room.playerCount >= room.maxPlayers ? '#FF5555' : '#FFFFFF',
          align: 'center'
        }
      ).setOrigin(0.5);
      
      this.roomListContainer.add([bg, id, name, players]);
      
      yOffset += itemHeight + 5;
    }
  }
  
  update() {
    // Animate starfield
    this.starfield.tilePositionY -= 0.5;
    
    if (this.showCreateRoomForm) {
      // Form navigation
      if (Phaser.Input.Keyboard.JustDown(this.escape)) {
        this.toggleCreateRoomForm(false);
      } else if (Phaser.Input.Keyboard.JustDown(this.enter)) {
        this.createRoom();
      }
    } else {
      // Room list navigation
      if (this.rooms.length > 0) {
        if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
          this.selectedRoomIndex = (this.selectedRoomIndex + 1) % this.rooms.length;
          this.updateRoomList();
        } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
          this.selectedRoomIndex = (this.selectedRoomIndex - 1 + this.rooms.length) % this.rooms.length;
          this.updateRoomList();
        } else if (Phaser.Input.Keyboard.JustDown(this.enter) && this.selectedRoomIndex >= 0) {
          this.joinRoom(this.rooms[this.selectedRoomIndex].id);
        }
      }
      
      // Create room shortcut
      if (Phaser.Input.Keyboard.JustDown(this.createKey)) {
        this.toggleCreateRoomForm(true);
      }
      
      // Team switching in team mode
      if (this.selectedLevel === "team" && Phaser.Input.Keyboard.JustDown(this.teamKey)) {
        this.selectTeam(this.selectedTeam === 'red' ? 'blue' : 'red');
      }
    }
  }
}