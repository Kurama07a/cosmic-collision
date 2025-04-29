export default class Constants {
  // Base dimensions (design reference)
  static BASE_WIDTH = 1440;
  static BASE_HEIGHT = 900;
  static ASPECT_RATIO = Constants.BASE_WIDTH / Constants.BASE_HEIGHT;

  // Dynamic dimensions that maintain aspect ratio
  static get WIDTH() {
    return window.innerWidth;
  }

  static get HEIGHT() {
    // Calculate height that maintains aspect ratio
    const heightByRatio = window.innerWidth / Constants.ASPECT_RATIO;
    const maxHeight = window.innerHeight;
    
    // Use the smaller of the two to ensure game fits in viewport
    return Math.min(heightByRatio, maxHeight);
  }

  static POINTS_TO_WIN = 100;
}