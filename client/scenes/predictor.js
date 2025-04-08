/**
 * CLIENT-SIDE PREDICTION IMPLEMENTATION
 * 
 * This module handles client-side prediction to reduce perceived latency
 * in player movements. It predicts player positions locally and reconciles
 * them with server updates to ensure smooth gameplay.
 */

export default class ClientPrediction {
    constructor() {
      // Server-confirmed state
      this.serverX = 0;
      this.serverY = 0;
      this.serverTimestamp = 0;
  
      // Predicted state
      this.predictedX = 0;
      this.predictedY = 0;
  
      // Input history for reconciliation
      this.inputHistory = [];
    }
  
    /**
     * Applies player input to the predicted position.
     * @param {number} dx - Change in X position
     * @param {number} dy - Change in Y position
     */
    applyInput(dx, dy) {
      this.predictedX += dx;
      this.predictedY += dy;
  
      // Store input with timestamp
      this.inputHistory.push({
        dx,
        dy,
        timestamp: Date.now()
      });
  
      // Keep input history manageable
      if (this.inputHistory.length > 10) {
        this.inputHistory.shift();
      }
    }
  
    /**
     * Reconciles predicted position with server state.
     * @param {number} serverX - Server-confirmed X position
     * @param {number} serverY - Server-confirmed Y position
     * @param {number} serverTimestamp - Timestamp of server update
     */
    reconcile(serverX, serverY, serverTimestamp) {
      // Calculate discrepancy
      const deltaX = serverX - this.predictedX;
      const deltaY = serverY - this.predictedY;
  
      // Snap to server position if discrepancy is too large
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        this.predictedX = serverX;
        this.predictedY = serverY;
      }
  
      // Re-apply unacknowledged inputs
      const unprocessedInputs = this.inputHistory.filter(
        input => input.timestamp > serverTimestamp
      );
  
      unprocessedInputs.forEach(input => {
        this.predictedX += input.dx;
        this.predictedY += input.dy;
      });
  
      // Update server reference state
      this.serverX = serverX;
      this.serverY = serverY;
      this.serverTimestamp = serverTimestamp;
    }
  
    /**
     * Returns the current predicted position.
     * @returns {Object} - Predicted X and Y coordinates
     */
    getPosition() {
      return { x: this.predictedX, y: this.predictedY };
    }
  }