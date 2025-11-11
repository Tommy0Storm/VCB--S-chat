/**
 * Example usage of the timeUtils module
 * This file demonstrates how to use the time utilities in a similar way to the Python example
 */

import { getCurrentTime, formatTime, TIMEZONES } from './timeUtils';

/**
 * Get current time example - similar to the Python example
 */
export const getCurrentTimeExample = async (): Promise<void> => {
  try {
    // Get current time in Africa/Johannesburg timezone (similar to the Python example)
    const currentTime = await getCurrentTime(TIMEZONES.JOHANNESBURG);
    
    if (currentTime) {
      // Format and display the time (similar to the Python print statement)
      console.log('Current time in Johannesburg:', formatTime(currentTime));
      
      // You can also format it in different ways
      console.log('Short format:', formatTime(currentTime, 'short'));
      console.log('ISO format:', formatTime(currentTime, 'iso'));
    } else {
      console.log('Failed to get current time');
    }
  } catch (error) {
    console.error('Error getting current time:', error);
  }
};

// Run the example if this file is executed directly
if (import.meta.url === new URL(`file://${process.argv[1]}`, import.meta.url).href) {
  getCurrentTimeExample();
}

// Example usage in other files:
// import { getCurrentTimeExample } from './timeUtils.example';
// getCurrentTimeExample();