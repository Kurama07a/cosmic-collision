var { Constants } = require("./constants");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");
const shortUUID = require("short-uuid"); // Import short-uuid for room codes

// init express server, socket io server, and serve static content from dist
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
    credentials: true,
  },
   cookie: {
    sameSite: "None",
    secure: true
  }
});
app.use(cors());
app.use(express.static("dist"));

const getRndInteger = (min, max) =>
  Math.floor(Math.random() * (max - min)) + min;

// Global lobby for everyone
const mainLobby = {
  id: "main",
  name: "Free-For-All",
  users: {},
  coin: { x: getRndInteger(50, Constants.WIDTH), y: getRndInteger(50, Constants.HEIGHT) },
  keystrokeStates: {},
  asteroids: new Map() // Add asteroid tracking
};

// Custom rooms storage
const customRooms = {};

// Track players and their room assignments
const playerRooms = {};

// Function to get room by ID
const getRoom = (roomId) => {
  if (roomId === "main") return mainLobby;
  return customRooms[roomId] || null;
};

// Function to join a room
const joinRoom = (socket, roomId) => {
  // Leave previous room if exists
  if (playerRooms[socket.id]) {
    const prevRoomId = playerRooms[socket.id];
    const prevRoom = getRoom(prevRoomId);
    
    if (prevRoom) {
      // Remove from previous room
      delete prevRoom.users[socket.id];
      delete prevRoom.keystrokeStates[socket.id];
      socket.leave(prevRoomId);
      
      // If custom room is empty, remove it
      if (prevRoomId !== "main" && Object.keys(prevRoom.users).length === 0) {
        delete customRooms[prevRoomId];
      }
    }
  }
  
  // Join new room
  const room = getRoom(roomId);
  if (room) {
    room.keystrokeStates[socket.id] = "00000"; // Default state
    playerRooms[socket.id] = roomId;
    socket.join(roomId);
    return room;
  }
  return null;
};

// Function to create a custom room
const createRoom = (name, maxPlayers = 8) => {
  const roomId = shortUUID.generate();
  customRooms[roomId] = {
    id: roomId,
    name: name || `Room ${roomId.substring(0, 6)}`,
    users: {},
    coin: { x: getRndInteger(50, Constants.WIDTH), y: getRndInteger(50, Constants.HEIGHT) },
    keystrokeStates: {},
    maxPlayers: maxPlayers,
    asteroids: new Map() // Add asteroid tracking
  };
  return customRooms[roomId];
};

// Function to get all available rooms
const getAvailableRooms = () => {
  const rooms = [
    {
      id: "main",
      name: "Free-For-All",
      playerCount: Object.keys(mainLobby.users).length,
      maxPlayers: Infinity
    }
  ];
  
  for (const id in customRooms) {
    const room = customRooms[id];
    rooms.push({
      id: room.id,
      name: room.name,
      playerCount: Object.keys(room.users).length,
      maxPlayers: room.maxPlayers
    });
  }
  
  return rooms;
};

io.on("connect", (socket) => {
  // Send available rooms list to client
  socket.emit("available_rooms", getAvailableRooms());

  // Handle room creation
  socket.on("create_room", ({ name, maxPlayers }, callback) => {
    const room = createRoom(name, maxPlayers);
    socket.emit("room_created", { 
      roomId: room.id,
      name: room.name,
      maxPlayers: room.maxPlayers
    });
    
    // Update available rooms for all users in lobby selection
    io.emit("available_rooms", getAvailableRooms());
  });

  // Handle room joining
  socket.on("join_room", ({ roomId, name }, callback) => {
    const room = getRoom(roomId);
    
    if (!room) {
      callback({ success: false, message: "Room not found" });
      return;
    }
    
    // Check if room is full
    if (roomId !== "main" && Object.keys(room.users).length >= room.maxPlayers) {
      callback({ success: false, message: "Room is full" });
      return;
    }
    
    const newRoom = joinRoom(socket, roomId);
    
    if (newRoom) {
      room.users[socket.id] = { 
        name, 
        score: 0, 
        x: getRndInteger(50, Constants.WIDTH), 
        y: getRndInteger(50, Constants.HEIGHT),
        angle: 0,
        bullets: []
      };
      
      callback({ 
        success: true,
        roomId: roomId,
        roomName: room.name
      });
      
      // Update available rooms
      io.emit("available_rooms", getAvailableRooms());
    } else {
      callback({ success: false, message: "Failed to join room" });
    }
  });

  /*
  When a user updates their info, broadcast their 
  new location to others in the same room.
  */
  socket.on("update_coordinates", (params) => {
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room) return;
    
    const { x, y, score, name, angle, bullets } = params;
    
    room.users[socket.id] = { x, y, score, name, bullets, angle };
    
    // Only broadcast to others in the same room
    socket.to(roomId).emit("to_others", {
      id: socket.id,
      score,
      x,
      y,
      name,
      bullets,
      angle,
    });
  });

  // Broadcast keystroke state updates within the room
  socket.on("keystroke_state", (state) => {
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room) return;
    
    room.keystrokeStates[socket.id] = state;
    socket.to(roomId).emit("keystroke_update", { id: socket.id, state });
  });

  socket.on("shot", (params) => {
    const roomId = playerRooms[socket.id];
    socket.to(roomId).emit("other_shot");
  });

  // Update coin position within the room
  socket.on("update_coin", (params) => {
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room) return;
    
    // If this is asteroid mode, update the coin score
    if (room.users[socket.id]) {
      const player = room.users[socket.id];
      if (!player.coinScore) player.coinScore = 0;
      player.coinScore += 5;
    }
    
    room.coin = { x: params.x, y: params.y };
    socket.to(roomId).emit("coin_changed", { coin: room.coin });
  });

  socket.on("collision", (params) => {
    const { bullet_user_id, bullet_index, target_id } = params;
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room || !room.users[target_id]) return;
    
    room.users[target_id].score = Math.max(0, room.users[target_id].score - 2); // Reduce score
    io.to(roomId).emit("other_collision", {
      bullet_user_id,
      bullet_index,
      exploded_user_id: target_id,
    });
  });

  // Initialize new user with room data
  socket.on("initialize_game", (params, callback) => {
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room) return;
    
    socket.emit("to_new_user", {
      id: socket.id,
      coin: room.coin,
      others: room.users,
      roomId: room.id,
      roomName: room.name
    });
  });

  // When user disconnects
  socket.on("disconnect", () => {
    const roomId = playerRooms[socket.id];
    const room = getRoom(roomId);
    
    if (!room) return;
    
    // Notify others in the room
    socket.to(roomId).emit("user_disconnected", { id: socket.id });
    
    // Clean up
    delete room.keystrokeStates[socket.id];
    delete room.users[socket.id];
    delete playerRooms[socket.id];
    
    // Remove custom room if empty
    if (roomId !== "main" && Object.keys(room.users).length === 0) {
      delete customRooms[roomId];
    }
    
    // Update room list
    io.emit("available_rooms", getAvailableRooms());
  });
  
  // Handle asteroid spawning requests
  socket.on("spawn_asteroid", () => {
    const roomId = playerRooms[socket.id];
    if (!roomId) return;
    
    const room = getRoom(roomId);
    if (!room) return;
    
    // Generate asteroid data
    const asteroid = generateAsteroid();
    room.asteroids.set(asteroid.id, asteroid);
    
    // Broadcast to everyone in the room
    io.to(roomId).emit("new_asteroid", asteroid);
  });
  
  // Handle asteroid splitting
  socket.on("spawn_asteroid_split", (data) => {
    const roomId = playerRooms[socket.id];
    if (!roomId) return;
    
    const room = getRoom(roomId);
    if (!room) return;
    
    // Create a new asteroid with the provided parameters
    const asteroid = {
      id: shortUUID.generate(),
      size: data.size,
      x: data.x,
      y: data.y,
      vx: data.vx,
      vy: data.vy,
      orbitParams: data.orbitParams,
      createdAt: Date.now()
    };
    
    room.asteroids.set(asteroid.id, asteroid);
    
    // Broadcast to everyone in the room
    io.to(roomId).emit("new_asteroid", asteroid);
  });
  
  // Handle asteroid destruction
  socket.on("asteroid_destroyed", (data) => {
    const roomId = playerRooms[socket.id];
    if (!roomId) return;
    
    const room = getRoom(roomId);
    if (!room) return;
    
    const { asteroidId, newScore, asteroidsDestroyed, coinScore } = data;
    
    // Remove asteroid from room tracking
    room.asteroids.delete(asteroidId);
    
    // Update user score and asteroid count
    if (room.users[socket.id]) {
      room.users[socket.id].score = newScore;
      room.users[socket.id].asteroidsDestroyed = asteroidsDestroyed;
      room.users[socket.id].coinScore = coinScore;
    }
    
    // Broadcast hit to everyone
    io.to(roomId).emit("asteroid_hit", {
      asteroidId,
      playerId: socket.id,
      playerScore: newScore,
      playerAsteroidCount: asteroidsDestroyed,
      playerCoinScore: coinScore
    });
  });
  
  // Handle player-asteroid collisions
  socket.on("player_asteroid_collision", (data) => {
    const roomId = playerRooms[socket.id];
    if (!roomId) return;
    
    const room = getRoom(roomId);
    if (!room) return;
    
    const { asteroidId, newScore, newCoinScore } = data;
    
    // Remove asteroid from room tracking
    room.asteroids.delete(asteroidId);
    
    // Update user score
    if (room.users[socket.id]) {
      room.users[socket.id].score = newScore;
      room.users[socket.id].coinScore = newCoinScore;
    }
    
    // Broadcast collision to everyone
    io.to(roomId).emit("asteroid_hit", {
      asteroidId,
      playerId: socket.id,
      playerScore: newScore,
      playerCoinScore: newCoinScore
    });
  });
  
  // Handle requests for initial asteroids
  socket.on("get_asteroids", () => {
    const roomId = playerRooms[socket.id];
    if (!roomId) return;
    
    const room = getRoom(roomId);
    if (!room) return;
    
    // Convert Map to Array for sending
    const asteroidList = Array.from(room.asteroids.values());
    socket.emit("initial_asteroids", asteroidList);
  });
});

app.get("/health", (req, res) => res.send(`${process.env.NODE_ENV}`));

server.listen(5000, () => {
  console.log("Server running on port 5000");
});

// Function to generate random asteroid data
function generateAsteroid() {
  // Randomly choose a size
  const sizes = ['large', 'medium', 'small'];
  const size = sizes[Math.floor(Math.random() * sizes.length)];
  
  // Set position at a random edge of the screen
  let x, y, vx, vy;
  const side = Math.floor(Math.random() * 4);
  
  switch (side) {
    case 0: // Top
      x = Math.random() * Constants.WIDTH;
      y = -50;
      vx = Math.random() * 200 - 100;
      vy = Math.random() * 100 + 50;
      break;
    case 1: // Right
      x = Constants.WIDTH + 50;
      y = Math.random() * Constants.HEIGHT;
      vx = -(Math.random() * 100 + 50);
      vy = Math.random() * 200 - 100;
      break;
    case 2: // Bottom
      x = Math.random() * Constants.WIDTH;
      y = Constants.HEIGHT + 50;
      vx = Math.random() * 200 - 100;
      vy = -(Math.random() * 100 + 50);
      break;
    case 3: // Left
      x = -50;
      y = Math.random() * Constants.HEIGHT;
      vx = Math.random() * 100 + 50;
      vy = Math.random() * 200 - 100;
      break;
  }
  
  // Generate orbital parameters for predictable motion
  const orbitParams = {
    startX: x,
    startY: y,
    vx: vx,
    vy: vy,
    curvature: (Math.random() * 0.4 + 0.1) * (Math.random() > 0.5 ? 1 : -1),
    wobble: {
      amplitude: Math.random() * 15,
      frequency: Math.random() * 0.4 + 0.1
    }
  };
  
  return {
    id: shortUUID.generate(),
    size,
    x,
    y,
    vx,
    vy,
    orbitParams,
    createdAt: Date.now()
  };
}
