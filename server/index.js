var { Constants } = require("./constants");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");

// init express server, socket io server, and serve static content from dist
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*", // Replace with your client URL
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

var numberOfConnectedUsers = 0;
var coin = { x: getRndInteger(50, Constants.WIDTH), y: getRndInteger(50, Constants.HEIGHT) };

//store user info, maps socket_id -> user object.
var all_users = {}; 

// Store keystroke states for all users
var keystrokeStates = {};

let screenDimensions = {
  width: Constants.WIDTH,
  height: Constants.HEIGHT,
};

io.on("connect", (socket) => {
  numberOfConnectedUsers++;

  // Initialize keystroke state for the new user
  keystrokeStates[socket.id] = "00000"; // Default state: all keys unpressed

  socket.on("update_screen_dimensions", (dimensions) => {
    screenDimensions.width = dimensions.width;
    screenDimensions.height = dimensions.height;
    console.log("Updated screen dimensions:", screenDimensions);
  });
  /*
  Give each new user an ID , coin position, and info on
  the remaining users.
  */
  socket.emit("to_new_user", {
    id: socket.id,
    coin: {
      x: Math.floor(Math.random() * screenDimensions.width),
      y: Math.floor(Math.random() * screenDimensions.height),
    },
    others: all_users,
  });
  

  /*
  When a user updates their info, broadcast their 
  new location to the others.
  */
  socket.on("update_coordinates", (params, callback) => {
    const x = params.x;
    const y = params.y;
    const score = params.score;
    const name = params.name;
    const angle = params.angle;
    const bullets = params.bullets;
    all_users[socket.id] = { x, y, score, name, bullets, angle };
    socket.broadcast.emit("to_others", {
      id: socket.id,
      score: score,
      x: x,
      y: y,
      name: name,
      bullets: bullets,
      angle: angle,
    });
  });

  // Broadcast keystroke state updates
  socket.on("keystroke_state", (state) => {
    keystrokeStates[socket.id] = state;
    socket.broadcast.emit("keystroke_update", { id: socket.id, state });
  });

  socket.on("shot", (p, c) => socket.broadcast.emit("other_shot"));

  /*
  When a user collects the coin, let the others
  know of its new position.
  */
  socket.on("update_coin", (params, callback) => {
    coin = { x: params.x, y: params.y };
    socket.broadcast.emit("coin_changed", {
      coin,
    });
  });

  socket.on("collision", (params, callback) => {
    socket.broadcast.emit("other_collision", {
      bullet_user_id: params.bullet_user_id,
      bullet_index: params.bullet_index,
      exploded_user_id: socket.id,
    });
  });

  /*
  When a user disconnects, remove them from server memory,
  and broadcast their disconnection to the others.
  */
  socket.on("disconnect", () => {
    numberOfConnectedUsers--;
    socket.broadcast.emit("user_disconnected", {
      id: socket.id,
    });
    delete keystrokeStates[socket.id];
    delete all_users[socket.id];
  });
});


app.get("/health", (req, res) => res.send(`${process.env.NODE_ENV}`));

// Expose server on 5000
server.listen(5000, () => {
  console.log("Server running on port 5000");
});
