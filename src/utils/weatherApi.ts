import { WeatherForecast } from './types/location';

// Helper function to convert weather code to text
function getWeatherConditionText(code: number): string {
  const weatherCodes: { [key: number]: string } = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  
  return weatherCodes[code] || 'Unknown';
}

// Helper function to convert weather code to icon URL
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getWeatherConditionIcon(code: number): string {
  // Return a placeholder icon URL since we're not using the original API's icons
  // Open-Meteo doesn't provide icons, so we'll use a simple text representation
  return '/weather-icon-placeholder.png';
}

export const getWeatherForecast = async (location: string): Promise<WeatherForecast> => {
  // Use Open-Meteo API - no API key required
  // First, geocode the location to get coordinates
  const geocodeResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`);
  
  if (!geocodeResponse.ok) {
    throw new Error(`Geocoding error: ${geocodeResponse.status}`);
  }
  
  const geocodeData = await geocodeResponse.json();
  
  if (!geocodeData || geocodeData.length === 0) {
    throw new Error('Location not found');
  }
  
  const { lat, lon } = geocodeData[0];
  
  // Fetch weather data from Open-Meteo
  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto`
  );
  
  if (!weatherResponse.ok) {
    throw new Error(`Weather API error: ${weatherResponse.status}`);
  }
  
  const data = await weatherResponse.json();
  
  // Format the response to match the expected WeatherForecast interface
  return {
    location: {
      name: location,
      region: '',
      country: ''
    },
    current: {
      temp_c: data.current.temperature_2m,
      condition: {
        text: getWeatherConditionText(data.current.weather_code),
        icon: getWeatherConditionIcon(data.current.weather_code)
      },
      wind_kph: data.current.wind_speed_10m * 3.6, // Convert m/s to km/h
      humidity: data.current.relative_humidity_2m,
      feelslike_c: data.current.apparent_temperature,
      uv: 0, // Open-Meteo doesn't provide UV index in this endpoint
      time: data.current.time // ISO 8601 format time from Open-Meteo API
    },
    forecast: {
      forecastday: data.daily.time.map((date: string, index: number) => ({
        date,
        day: {
          maxtemp_c: data.daily.temperature_2m_max[index],
          mintemp_c: data.daily.temperature_2m_min[index],
          condition: {
            text: getWeatherConditionText(data.daily.weather_code[index]),
            icon: getWeatherConditionIcon(data.daily.weather_code[index])
          },
          daily_chance_of_rain: data.daily.precipitation_sum[index] > 0 ? 100 : 0,
          daily_chance_of_snow: data.daily.snowfall_sum[index] > 0 ? 100 : 0,
          maxwind_kph: data.daily.wind_speed_10m_max[index] * 3.6, // Convert m/s to km/h
          avghumidity: data.daily.relative_humidity_2m ? data.daily.relative_humidity_2m[index] : 0,
          uv: 0
        }
      }))
    }
  };
};

export const formatWeatherForAI = (weather: WeatherForecast): string => {
  const { location, current } = weather;
  
  let context = `\n\n--- WEATHER CONTEXT ---\n`;
  context += `Location: ${location.name}\n`;
  context += `Current: ${current.temp_c}°C, ${current.condition.text}\n`;
  context += `Feels like: ${current.feelslike_c}°C\n`;
  context += `Time: ${new Date(current.time).toLocaleTimeString('en-ZA', { hour12: true, hour: '2-digit', minute: '2-digit' })}\n`;
  
  return context;
};

export const formatAdvancedWeatherForAI = (weather: WeatherForecast): string => {
  const { location, current } = weather;
  
  let context = `\n\n--- ADVANCED WEATHER CONTEXT ---\n`;
  context += `Location: ${location.name}\n`;
  context += `Current: ${current.temp_c}°C, ${current.condition.text}\n`;
  context += `Feels like: ${current.feelslike_c}°C\n`;
  context += `Wind: ${current.wind_kph.toFixed(0)} km/h from ${current.wind_direction_10m}°\n`;
  context += `Humidity: ${current.humidity}%\n`;
  context += `Pressure: ${current.pressure_msl} hPa\n`;
  context += `Cloud cover: ${current.cloud_cover}%\n`;
  context += `Precipitation: ${current.precipitation} mm\n`;
  context += `Rain: ${current.rain} mm\n`;
  context += `Showers: ${current.showers} mm\n`;
  context += `Snowfall: ${current.snowfall} mm\n`;
  context += `Is day: ${current.is_day ? 'Yes' : 'No'}\n`;
  context += `Time: ${new Date(current.time).toLocaleTimeString('en-ZA', { hour12: true, hour: '2-digit', minute: '2-digit' })}\n`;
  
  return context;
};
