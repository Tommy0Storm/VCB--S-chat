# GOGGA API Keys Configuration

This document lists all API keys required for GOGGA to function properly.

## Required API Keys

### 1. **VITE_CEREBRAS_API_KEY** (Required)
- **Purpose**: Powers the AI chat functionality (Llama 3.3, Qwen models)
- **Get it from**: https://cloud.cerebras.ai/
- **Free tier**: Yes (limited requests)
- **Usage**: Main AI responses, CePO reasoning, thinking mode
- **Add to `.env`**: 
  ```
  VITE_CEREBRAS_API_KEY=your_cerebras_key_here
  ```

### 2. **VITE_DEEPINFRA_API_KEY** (Required for images)
- **Purpose**: FLUX-1.1-pro image generation
- **Get it from**: https://deepinfra.com/
- **Free tier**: Yes (limited credits)
- **Usage**: Generate images when user requests
- **Add to `.env`**: 
  ```
  VITE_DEEPINFRA_API_KEY=your_deepinfra_key_here
  ```

### 3. **VITE_SERPAPI_KEY** (Required for search)
- **Purpose**: Web search, local places, Google Maps integration
- **Get it from**: https://serpapi.com/
- **Free tier**: 200 searches/month
- **Usage**: 
  - Find coffee shops, restaurants, businesses
  - Display local places with ratings and reviews
  - Show Google Maps images
  - Multi-engine search (Google, DuckDuckGo, Bing, Yahoo)
- **Add to `.env`**: 
  ```
  VITE_SERPAPI_KEY=your_serpapi_key_here
  ```

### 4. **WeatherAPI Key** (Already Configured)
- **Purpose**: 3-day weather forecast, air quality, sports, astronomy
- **Key**: `301ee26e8eaf4253964134839250811`
- **Status**: ✅ Already hardcoded in `src/utils/weatherApi.ts`
- **Free tier**: Yes (1M calls/month)
- **Usage**:
  - Display 3-day forecast widget
  - Provide weather context to AI for recommendations
  - Check conditions for outdoor activities, sports, dining
  - Air quality index (AQI)
  - Sports schedules
  - Astronomy data (sunrise, sunset, moon phases)
- **No action needed**: This key is already configured for all users

### 5. **VITE_NEWSAPI_KEY** (New - For news headlines)
- **Purpose**: Fetch top headlines and search news articles from over 150,000 sources
- **Get it from**: https://newsapi.org/
- **Free tier**: 500 requests/day
- **Usage**: 
  - Display local news headlines next to chat interface
  - Search for articles by keyword/topic
  - Provide contextually relevant news to AI responses
  - Filter by country (default: South Africa) and category
- **Add to `.env`**: 
  ```
  VITE_NEWSAPI_KEY=your_newsapi_key_here
  ```

## Setup Instructions

1. **Copy the example file**:
   ```bash
   cp .env.example .env
   ```

2. **Add your API keys** to `.env`:
   ```env
   VITE_CEREBRAS_API_KEY=sk-xxxxxxxxxxxxx
   VITE_DEEPINFRA_API_KEY=xxxxxxxxxxxxx
   VITE_SERPAPI_KEY=xxxxxxxxxxxxx
   VITE_NEWSAPI_KEY=your_newsapi_key_here
   ```

3. **Restart the dev server**:
   ```bash
   npm run dev
   ```

## API Key Priorities

### Critical (App won't work without these):
- ✅ **VITE_CEREBRAS_API_KEY** - Core AI functionality

### Important (Features disabled without these):
- ⚠️ **VITE_SERPAPI_KEY** - Search and local places
- ⚠️ **VITE_DEEPINFRA_API_KEY** - Image generation
- ⚠️ **VITE_NEWSAPI_KEY** - News headlines and search

### Optional (Already configured):
- ✅ **WeatherAPI** - Weather widget and context

## Free Tier Limits

| Service | Free Tier | Upgrade Cost |
|---------|-----------|--------------|
| Cerebras | Limited requests | Pay-as-you-go |
| DeepInfra | Limited credits | $0.0003/image |
| SerpAPI | 100 searches/month | $50/month (5,000 searches) |
| WeatherAPI | 1M calls/month | Free forever |
| NewsAPI | 500 requests/day | $10/month (10,000 requests) |

## Security Notes

- ⚠️ **Never commit `.env` to Git** (already in `.gitignore`)
- ⚠️ **Keep API keys secure** - don't share publicly
- ⚠️ **Rotate keys** if accidentally exposed
- ✅ **Use environment variables** for production deployment

## Troubleshooting

### "API key not found" error
- Check that `.env` file exists in project root
- Verify key names match exactly (case-sensitive)
- Restart dev server after adding keys

### "Rate limit exceeded" error
- Check your usage on the provider's dashboard
- Upgrade to paid tier if needed
- Implement caching to reduce API calls

### Weather not showing
- Weather should work automatically (key is hardcoded)
- Check browser console for errors
- Verify location is set (needed for weather)

### News headlines not showing
- Check that VITE_NEWSAPI_KEY is set in .env
- Verify network connection
- Check browser console for NewsAPI errors

## Production Deployment

For production (Vercel, Netlify, etc.), add environment variables in your hosting platform:

**Vercel**:
```bash
vercel env add VITE_CEREBRAS_API_KEY
vercel env add VITE_DEEPINFRA_API_KEY
vercel env add VITE_SERPAPI_KEY
vercel env add VITE_NEWSAPI_KEY
```

**Netlify**:
- Go to Site Settings → Environment Variables
- Add each key manually

## Support

For API key issues:
- **Cerebras**: https://cloud.cerebras.ai/docs
- **DeepInfra**: https://deepinfra.com/docs
- **SerpAPI**: https://serpapi.com/docs
- **WeatherAPI**: https://www.weatherapi.com/docs/
- **NewsAPI**: https://newsapi.org/docs

For GOGGA issues: info@vcb-ai.online
