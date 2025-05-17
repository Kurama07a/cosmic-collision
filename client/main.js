import Phaser from 'phaser';
import PlayGame from "./scenes/PlayGame";
import Welcome from "./scenes/Welcome";
import Winner from "./scenes/Winner";
import RoomSelection from "./scenes/RoomSelection";
import LevelSelect from "./scenes/LevelSelect";
import Constants from "./constants";

// Custom starfield shader
const starfieldShader = {
  key: 'starfield',
  fragment: `
    precision mediump float;
    uniform float time;
    uniform vec2 resolution;

    void main() {
      vec2 p = (gl_FragCoord.xy / resolution.xy) - 0.5;
      float stars = 0.0;
      for(float i = 0.0; i < 5.0; i++) {
        vec2 position = p * (i * 0.5);
        position.y += time * 0.05 * (i + 0.5) * 0.1;
        position = fract(position);
        float intensity = 0.05 / length(position - 0.5);
        stars += intensity * smoothstep(0.9, 1.0, intensity);
      }
      gl_FragColor = vec4(vec3(stars), 1.0);
    }
  `
};

// Custom light flare shader
const lightFlareShader = {
  key: 'flare',
  fragment: `
    precision mediump float;
    uniform float time;
    uniform vec2 resolution;
    
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(uv, center) * 2.0;
      
      float brightness = 0.3 - dist;
      vec3 color = vec3(0.5, 0.5, 1.0) * brightness;
      
      // Add some lens flare elements
      float flare1 = max(0.0, 0.3 - length(uv - center) * 4.0);
      color += vec3(1.0, 0.8, 0.5) * flare1;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// Load WebFont script before initializing the game
const webFontScript = document.createElement('script');
webFontScript.src = 'https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js';
document.head.appendChild(webFontScript);

// Create a loading screen element
const loadingElement = document.createElement('div');
loadingElement.style.position = 'fixed';
loadingElement.style.top = '0';
loadingElement.style.left = '0';
loadingElement.style.width = '100%';
loadingElement.style.height = '100%';
loadingElement.style.backgroundColor = '#202830';
loadingElement.style.display = 'flex';
loadingElement.style.flexDirection = 'column';
loadingElement.style.alignItems = 'center';
loadingElement.style.justifyContent = 'center';
loadingElement.style.zIndex = '9999';
loadingElement.style.color = '#FFE81F';
loadingElement.style.fontFamily = 'Arial, sans-serif';
loadingElement.innerHTML = `
  <h1 style="font-size: 2.5rem; margin-bottom: 2rem;">COSMIC COLLISION</h1>
  <p style="font-size: 1.2rem; margin-bottom: 2rem;">Loading game assets...</p>
  <div style="width: 300px; height: 20px; background-color: #000; border: 2px solid #FFE81F; border-radius: 10px; overflow: hidden;">
    <div id="progressBar" style="width: 0%; height: 100%; background-color: #FFE81F; transition: width 0.3s;"></div>
  </div>
`;
document.body.appendChild(loadingElement);

// Function to start the game once WebFont is loaded
function startGame() {
  const config = {
    type: Phaser.AUTO,
    scale: {
      mode: Phaser.Scale.RESIZE,
      parent: 'game',
      width: Constants.WIDTH,
      height: Constants.HEIGHT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: { default: "arcade" },
    backgroundColor: "#202830",
    render: {
      pixelArt: false,
      antialias: true
    },
    // Add custom shaders
    shaders: [starfieldShader, lightFlareShader],
    // Add a loading callback to track progress
    callbacks: {
      postBoot: (game) => {
        // Track asset loading progress
        game.events.on('progress', (value) => {
          const progressBar = document.getElementById('progressBar');
          if (progressBar) {
            progressBar.style.width = `${Math.floor(value * 100)}%`;
          }
        });
      }
    }
  };

  const game = new Phaser.Game(config);

  game.scene.add("roomselection", RoomSelection);
  game.scene.add("playgame", PlayGame);
  game.scene.add("welcome", Welcome);
  game.scene.add("winner", Winner);
  game.scene.add("levelselect", LevelSelect);
  
  // Start the welcome scene after a short delay to ensure everything is ready
  game.scene.start("welcome");
  
  // When the game is ready, remove the loading screen
  game.events.on('ready', () => {
    // Add a slight delay to ensure everything is rendered
    setTimeout(() => {
      if (loadingElement && loadingElement.parentNode) {
        loadingElement.style.opacity = '0';
        loadingElement.style.transition = 'opacity 1s';
        setTimeout(() => {
          loadingElement.parentNode.removeChild(loadingElement);
        }, 1000);
      }
    }, 500);
  });

  // Listen for resize events to update game dimensions
  window.addEventListener('resize', () => {
    // Scale manager handles the resizing automatically
    // We just need to update any custom UI elements or calculations
    game.events.emit('resize', Constants.WIDTH, Constants.HEIGHT);
  });
}

// Wait for WebFont and then initialize the game
webFontScript.onload = function() {
  try {
    window.WebFont.load({
      google: {
        families: ['Exo 2:700,400', 'Rajdhani:500,700']
      },
      active: function() {
        console.log("WebFont loaded successfully");
        startGame();
      },
      inactive: function() {
        console.warn("WebFont failed to load fonts, using system fonts");
        startGame();
      },
      loading: function() {
        console.log("WebFont loading...");
      },
      fontloading: function(familyName, fvd) {
        console.log("Loading font: " + familyName);
        // Update loading progress indicator
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
          progressBar.style.width = '70%';
        }
      },
      fontactive: function(familyName, fvd) {
        console.log("Font loaded: " + familyName);
      },
      fontinactive: function(familyName, fvd) {
        console.warn("Failed to load font: " + familyName);
      }
    });
  } catch (error) {
    console.error("Error during WebFont loading:", error);
    startGame(); // Fallback to system fonts
  }
};

// Fallback if WebFont fails to load
webFontScript.onerror = function() {
  console.warn("WebFont failed to load, using system fonts");
  startGame();
};

// Set a timeout in case WebFont takes too long
setTimeout(() => {
  if (!window.WebFont) {
    console.warn("WebFont took too long to load, using system fonts");
    startGame();
  }
}, 5000);