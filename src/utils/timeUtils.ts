import { DateTime } from 'luxon';

const toDateTime = (value: Date | DateTime): DateTime => {
  if (DateTime.isDateTime(value)) {
    return value as DateTime;
  }
  return DateTime.fromJSDate(value);
};

/**
 * Get current time with NTP synchronization
 * @param timezone Optional timezone (defaults to Africa/Johannesburg)
 * @returns Promise<DateTime> Luxon DateTime object
 */
export const getCurrentTime = async (timezone: string = 'Africa/Johannesburg'): Promise<DateTime | null> => {
  try {
    // Try to get time from NTP server
    const ntpTime = await getNTPTime();
    if (ntpTime) {
      return ntpTime.setZone(timezone);
    }
    
    // Fallback to system time
    console.warn('Failed to get NTP time, falling back to system time');
    return DateTime.now().setZone(timezone);
  } catch (error) {
    console.error('Error getting current time:', error);
    return null;
  }
};

/**
 * Get time from NTP server
 * @returns Promise<DateTime | null> Luxon DateTime object or null if failed
 */
export const getNTPTime = async (): Promise<DateTime | null> => {
  // For web browsers, we can't directly access NTP servers due to CORS restrictions
  // We'll use a workaround with a CORS proxy or a dedicated time API
  
  try {
    // Try WorldTimeAPI as an alternative to NTP
    const response = await fetch('https://worldtimeapi.org/api/timezone/Africa/Johannesburg');
    if (response.ok) {
      const data = await response.json();
      return DateTime.fromISO(data.datetime);
    }
  } catch (error) {
    console.warn('Failed to get time from WorldTimeAPI:', error);
  }
  
  // Fallback to system time
  return DateTime.now();
};

/**
 * Format time for display
 * @param time DateTime object
 * @param format Optional format string
 * @returns Formatted time string
 */
export const formatTime = (input: Date | DateTime, format: string = 'full'): string => {
  const time = toDateTime(input);

  switch (format) {
    case 'short':
      return time.toLocaleString(DateTime.TIME_SIMPLE);
    case 'full':
      return time.toLocaleString(DateTime.DATETIME_FULL);
    case 'iso': {
      const isoString = time.toISO();
      return isoString ?? time.toJSDate().toISOString();
    }
    case 'date':
      return time.toLocaleString(DateTime.DATE_FULL);
    case 'time':
      return time.toLocaleString(DateTime.TIME_WITH_SECONDS);
    default:
      return time.toFormat(format);
  }
};

/**
* Format time for GOGGA-style greetings
* @param time Optional time to format (defaults to current time)
* @returns Formatted greeting string
*/
export const formatGoggaGreeting = (input: Date | DateTime = DateTime.now()): string => {
  const time = toDateTime(input);
  const dateStr = time.toLocaleString(DateTime.DATE_MED);
  const timeStr = time.toLocaleString(DateTime.TIME_SIMPLE);
  return `It's currently ${dateStr} ${timeStr}. We've just started our conversation, and I'm excited to chat with you. How can I assist you today?`;
};

/**
 * Get time difference in human readable format
 * @param startTime Start time
 * @param endTime End time (defaults to now)
 * @returns Human readable time difference
 */
export const getTimeDifference = (startTime: Date | DateTime, endTime: Date | DateTime = DateTime.now()): string => {
  const start = toDateTime(startTime);
  const end = toDateTime(endTime);
  const diff = end.diff(start, ['years', 'months', 'days', 'hours', 'minutes', 'seconds']);
  
  if (diff.years > 0) {
    return `${Math.floor(diff.years)} year${diff.years > 1 ? 's' : ''} ago`;
  } else if (diff.months > 0) {
    return `${Math.floor(diff.months)} month${diff.months > 1 ? 's' : ''} ago`;
  } else if (diff.days > 0) {
    return `${Math.floor(diff.days)} day${diff.days > 1 ? 's' : ''} ago`;
  } else if (diff.hours > 0) {
    return `${Math.floor(diff.hours)} hour${diff.hours > 1 ? 's' : ''} ago`;
  } else if (diff.minutes > 0) {
    return `${Math.floor(diff.minutes)} minute${diff.minutes > 1 ? 's' : ''} ago`;
  } else {
    return `${Math.floor(diff.seconds)} second${diff.seconds > 1 ? 's' : ''} ago`;
  }
};

/**
 * Check if a time is within a certain range
 * @param time Time to check
 * @param rangeInMinutes Range in minutes
 * @returns Boolean indicating if time is within range
 */
export const isTimeWithinRange = (input: Date | DateTime, rangeInMinutes: number): boolean => {
  const time = toDateTime(input);
  const now = DateTime.now();
  const diff = now.diff(time, 'minutes').minutes;
  return Math.abs(diff) <= rangeInMinutes;
};

/**
 * Convert time to different timezone
 * @param time Time to convert
 * @param timezone Target timezone
 * @returns Time in target timezone
 */
export const convertToTimezone = (input: Date | DateTime, timezone: string): DateTime => {
  const time = toDateTime(input);
  return time.setZone(timezone);
};

/**
 * Get start of day, week, month, or year
 * @param period Period to get start of
 * @param timezone Timezone (defaults to Africa/Johannesburg)
 * @returns DateTime object
 */
export const getStartOfPeriod = (period: 'day' | 'week' | 'month' | 'year', timezone: string = 'Africa/Johannesburg'): DateTime => {
  const now = DateTime.now().setZone(timezone);
  
  switch (period) {
    case 'day':
      return now.startOf('day');
    case 'week':
      return now.startOf('week');
    case 'month':
      return now.startOf('month');
    case 'year':
      return now.startOf('year');
    default:
      return now;
  }
};

/**
 * Add time to a DateTime object
 * @param time Base time
 * @param amount Amount to add
 * @param unit Unit of time to add
 * @returns New DateTime object
 */
export const addTime = (input: Date | DateTime, amount: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'): DateTime => {
  const time = toDateTime(input);
  return time.plus({ [unit]: amount });
};

/**
 * Get time in a specific format for logging
 * @param time Time to format
 * @returns Formatted time string for logs
 */
export const getLogTime = (input: Date | DateTime = DateTime.now()): string => {
  const time = toDateTime(input);
  return time.toFormat('yyyy-MM-dd HH:mm:ss');
};

// Export commonly used timezones
export const TIMEZONES = {
  JOHANNESBURG: 'Africa/Johannesburg',
  CAPE_TOWN: 'Africa/Johannesburg', // Same as Johannesburg
  DURBAN: 'Africa/Johannesburg', // Same as Johannesburg
  UTC: 'UTC',
  NEW_YORK: 'America/New_York',
  LONDON: 'Europe/London'
};

// Export Luxon DateTime for direct usage
export { DateTime };

// Example usage:
// const currentTime = await getCurrentTime();
// if (currentTime) {
//   console.log(formatTime(currentTime));
// }