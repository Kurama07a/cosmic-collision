## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/phaser3-multiplayer.git
    cd phaser3-multiplayer
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

## Running the Game

1. Build the client-side code:
    ```sh
    npm run build
    ```

2. Start the server:
    ```sh
    npm start
    ```
3. go through the client/playgame.js and change the deployement variable to localhost:5000 and do the same in server/main.js if the  game does not run

4. Open your browser and navigate to `http://localhost:5000` to play the game.

## Game Instructions

- Enter your name on the welcome screen.
- Use the arrow keys to move your spaceship.
- Press the spacebar to shoot bullets.
- Collect coins to score points.
- The first player to reach 100 points wins the game.

## Development

### Client-side Code

The client-side code is located in the `client` directory. It includes the following files:

- `constants.js`: Contains game constants such as screen width, height, and points to win.
- `index.html`: The HTML file for the game.
- `main.js`: The main entry point for the Phaser game.
- `assets/`: Contains game assets such as images and sounds.
- `scenes/`: Contains Phaser scenes for different parts of the game.

### Server-side Code

The server-side code is located in the `server` directory. It includes the following files:

- `constants.js`: Contains server-side constants.
- `index.js`: The main server file that sets up the Express server and Socket.io.

### Webpack Configuration

The `webpack.config.js` file contains the configuration for Webpack, which is used to bundle the client-side code.

### Keystroke-Based Movement

The game now uses a keystroke-based system to reduce lag. Each client sends a binary string representing the state of keys (up, down, left, right, fire) to the server. The server broadcasts these states to all clients, and each client updates player positions locally based on the received states.

## License

This project is licensed under the MIT License.