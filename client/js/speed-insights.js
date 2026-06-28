/**
 * @file speed-insights.js
 * @description Initializes Vercel Speed Insights for performance monitoring
 */

import { injectSpeedInsights } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@2/dist/index.mjs';

/**
 * Initialize Vercel Speed Insights
 * This function should be called once when the application loads
 */
export function initSpeedInsights() {
  try {
    // Inject Speed Insights tracking
    // The injectSpeedInsights function will automatically detect the environment
    // and only track in production (not in development/localhost)
    injectSpeedInsights({
      // Optional configuration:
      // debug: true, // Enable to see Speed Insights events in console during development
      // sampleRate: 1, // Sample rate (1 = 100%, 0.5 = 50%, etc.)
    });
    
    console.log('Vercel Speed Insights initialized');
  } catch (error) {
    console.error('Failed to initialize Speed Insights:', error);
  }
}
