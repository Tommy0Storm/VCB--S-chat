/**
 * Simple test file to verify time utilities are working correctly
 */

import { getCurrentTime, formatTime, getTimeDifference, isTimeWithinRange, TIMEZONES } from './timeUtils';

async function runTimeUtilsTest(): Promise<void> {
  console.log('=== Time Utilities Test ===\n');

  try {
    // Test 1: Get current time
    console.log('Test 1: Getting current time...');
    const currentTime = await getCurrentTime();
    if (currentTime) {
      console.log('✓ Current time (Johannesburg):', formatTime(currentTime));
      console.log('✓ Current time (ISO):', formatTime(currentTime, 'iso'));
    } else {
      console.log('✗ Failed to get current time');
    }

    // Test 2: Get time in different timezone
    console.log('\nTest 2: Getting time in different timezone...');
    const nyTime = await getCurrentTime('America/New_York');
    if (nyTime) {
      console.log('✓ New York time:', formatTime(nyTime));
    }

    // Test 3: Time difference calculation
    console.log('\nTest 3: Calculating time difference...');
    const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const timeDiff = getTimeDifference(pastTime);
    console.log('✓ Time difference (5 minutes ago):', timeDiff);

    // Test 4: Time range checking
    console.log('\nTest 4: Checking time range...');
    const recentTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const isWithin30Min = isTimeWithinRange(recentTime, 30);
    console.log('✓ Is 10 minutes ago within 30 minutes?', isWithin30Min);

    const oldTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const isWithin30MinOld = isTimeWithinRange(oldTime, 30);
    console.log('✓ Is 1 hour ago within 30 minutes?', isWithin30MinOld);

    // Test 5: Timezone constants
    console.log('\nTest 5: Checking timezone constants...');
    console.log('✓ Johannesburg timezone:', TIMEZONES.JOHANNESBURG);
    console.log('✓ Cape Town timezone:', TIMEZONES.CAPE_TOWN);
    console.log('✓ Durban timezone:', TIMEZONES.DURBAN);

    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the test if this file is executed directly
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  runTimeUtilsTest().catch(console.error);
}

export { runTimeUtilsTest };