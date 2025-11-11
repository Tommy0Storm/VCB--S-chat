/**
 * Simple demo file to show how to use time utilities
 */

// Import the time utilities
import { getCurrentTime, formatTime, getTimeDifference } from './timeUtils.ts';

async function runTimeUtilsDemo() {
  console.log('=== Time Utilities Demo ===\n');

  try {
    // Get current time
    console.log('1. Getting current time...');
    const currentTime = await getCurrentTime();
    if (currentTime) {
      console.log('   Current time (Johannesburg):', formatTime(currentTime));
      console.log('   Current time (ISO):', formatTime(currentTime, 'iso'));
    } else {
      console.log('   Failed to get current time');
    }

    // Show time difference
    console.log('\n2. Calculating time difference...');
    const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const timeDiff = getTimeDifference(pastTime);
    console.log('   Time difference (5 minutes ago):', timeDiff);

    console.log('\n=== Demo completed ===');
  } catch (error) {
    console.error('Error during demo:', error);
  }
}

// Export for use in other files
export { runTimeUtilsDemo };

// Run the demo if this file is executed directly
if (typeof window === 'undefined' && typeof process !== 'undefined' && 
    (typeof require !== 'undefined' || typeof import.meta.url !== 'undefined')) {
  // This would run in a Node.js environment with proper TypeScript support
  // For now, we'll just export the function
  console.log('Time utilities demo ready to run');
}