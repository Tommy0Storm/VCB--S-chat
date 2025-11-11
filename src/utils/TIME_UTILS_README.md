# Time Utilities for VCB Application

This document explains how to use the time utilities module and integrate it with the existing VCB application components.

## Overview

The time utilities module provides enhanced time handling capabilities for the VCB application, including:

- NTP time synchronization
- Timezone support (especially for Africa/Johannesburg)
- Human-readable time formatting
- Time difference calculations
- Time range checking

## Installation

The time utilities module has already been installed with the required dependencies:

```bash
npm install luxon
```

## Files

1. `timeUtils.ts` - Main time utilities module
2. `timeUtils.example.ts` - Basic usage examples
3. `timeUtils.integration.example.ts` - Advanced integration examples
4. `conversationManager.ts` - Updated with time utilities import

## API Reference

### getCurrentTime(timezone: string = 'Africa/Johannesburg'): Promise<DateTime | null>

Get the current time with NTP synchronization.

```typescript
import { getCurrentTime } from './timeUtils';

const currentTime = await getCurrentTime();
if (currentTime) {
  console.log('Current time:', currentTime.toISO());
}
```

### formatTime(time: DateTime, format: string = 'full'): string

Format time for display.

```typescript
import { getCurrentTime, formatTime } from './timeUtils';

const currentTime = await getCurrentTime();
if (currentTime) {
  console.log('Full format:', formatTime(currentTime, 'full'));
  console.log('Short format:', formatTime(currentTime, 'short'));
  console.log('ISO format:', formatTime(currentTime, 'iso'));
}
```

### getTimeDifference(startTime: DateTime, endTime: DateTime = DateTime.now()): string

Get time difference in human readable format.

```typescript
import { getCurrentTime, getTimeDifference } from './timeUtils';

const startTime = await getCurrentTime();
// ... some time passes ...
const difference = getTimeDifference(startTime);
console.log('Time elapsed:', difference); // e.g., "5 minutes ago"
```

### isTimeWithinRange(time: DateTime, rangeInMinutes: number): boolean

Check if a time is within a certain range.

```typescript
import { isTimeWithinRange } from './timeUtils';

const isRecent = isTimeWithinRange(new Date(someTimestamp), 30); // Within 30 minutes
```

## Integration Examples

### 1. Enhanced Conversation Manager

The `TimeAwareConversationManager` extends the existing `ConversationManager` with time-aware features:

```typescript
import { TimeAwareConversationManager } from './timeUtils.integration.example';

const timeAwareCM = new TimeAwareConversationManager();

// Get conversations from specific periods
const todaysConvs = await timeAwareCM.getConversationsByPeriod('today');
const yesterdaysConvs = await timeAwareCM.getConversationsByPeriod('yesterday');

// Get recent conversations
const recentConvs = timeAwareCM.getRecentConversations(60); // Last hour

// Format conversation timestamps
const formattedTime = timeAwareCM.formatConversationTime(conversation.createdAt);
```

### 2. Time-Aware Session Manager

The `TimeAwareSessionManager` provides enhanced session tracking:

```typescript
import { TimeAwareSessionManager } from './timeUtils.integration.example';

const sessionManager = new TimeAwareSessionManager();

// Update activity
sessionManager.updateActivity();

// Get session duration
const duration = await sessionManager.getSessionDuration();

// Check if session is active
const isActive = sessionManager.isSessionActive();

// Get formatted current time
const currentTime = await sessionManager.getFormattedCurrentTime();
```

## Usage in App.tsx

The time utilities can be integrated into the main application in several ways:

### Session Time Tracking

Replace the existing session time tracking with the enhanced version:

```typescript
// In App.tsx useEffect hook for session timer
useEffect(() => {
  const interval = setInterval(async () => {
    const sessionManager = new TimeAwareSessionManager();
    const elapsed = await sessionManager.getSessionDuration();
    // Update UI with formatted time
  }, 60000); // Update every minute

  return () => clearInterval(interval);
}, []);
```

### Conversation Timestamps

Use the enhanced formatting for conversation timestamps:

```typescript
// In message display component
const timeAwareCM = new TimeAwareConversationManager();
const formattedTime = timeAwareCM.formatConversationTime(message.timestamp);
```

## Timezone Support

The time utilities default to Africa/Johannesburg timezone but support all standard timezones:

```typescript
// Get time in different timezones
const johannesburgTime = await getCurrentTime('Africa/Johannesburg');
const newYorkTime = await getCurrentTime('America/New_York');
const londonTime = await getCurrentTime('Europe/London');

// Use predefined timezones
import { TIMEZONES } from './timeUtils';
const currentTime = await getCurrentTime(TIMEZONES.JOHANNESBURG);
```

## Error Handling

The time utilities include proper error handling:

```typescript
try {
  const currentTime = await getCurrentTime();
  if (!currentTime) {
    console.warn('Failed to get NTP time, using system time');
    // Fallback to system time
  }
} catch (error) {
  console.error('Error getting current time:', error);
}
```

## Testing

To test the time utilities:

1. Run the example files:
   ```bash
   node src/utils/timeUtils.example.ts
   node src/utils/timeUtils.integration.example.ts
   ```

2. Check that timestamps in conversations are properly formatted

3. Verify that session time tracking works correctly

4. Test timezone conversions with different locations

## Troubleshooting

### Common Issues

1. **NTP Server Unreachable**: The module will fall back to system time with a warning
2. **Invalid Timezone**: Will default to UTC with a console warning
3. **Network Issues**: Time synchronization may be delayed

### Best Practices

1. Always check if the returned DateTime object is valid before using it
2. Use the provided timezone constants for consistency
3. Handle errors gracefully in UI components
4. Cache time values when appropriate to reduce API calls

## Future Enhancements

Possible future enhancements to the time utilities:

1. Add support for recurring time patterns
2. Implement more sophisticated time range calculations
3. Add holiday and business day calculations for South Africa
4. Include load shedding schedule integration
5. Add time-based reminders and notifications

## Contributing

To contribute to the time utilities:

1. Add new utility functions to `timeUtils.ts`
2. Include comprehensive tests
3. Update this documentation
4. Ensure backward compatibility
5. Follow existing code style and patterns