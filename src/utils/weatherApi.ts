const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';

export interface WeatherDay {
  date: string;
  maxtemp_c: number;
  mintemp_c: number;
  condition: {
    text: string;
    icon: string;
  };
  daily_chance_of_rain: number;
  daily_chance_of_snow: number;
  maxwind_kph: number;
  avghumidity: number;
  uv: number;
}

export interface WeatherForecast {
  location: {
    name: string;
    region: string;
    country: string;
  };
  current: {
    temp_c: number;
    condition: {
      text: string;
      icon: string;
    };
    wind_kph: number;
    humidity: number;
    feelslike_c: number;
    uv: number;
  };
  forecast: {
    forecastday: Array<{
      date: string;
      day: WeatherDay;
    }>;
  };
  alerts?: {
    alert: Array<{
      headline: string;
      severity: string;
      event: string;
    }>;
  };
}

export interface AirQuality {
  co: number;
  no2: number;
  o3: number;
  so2: number;
  pm2_5: number;
  pm10: number;
  'us-epa-index': number;
  'gb-defra-index': number;
}

export const getWeatherForecast = async (location: string): Promise<WeatherForecast> => {
  const response = await fetch(
    `${WEATHER_API_BASE}/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(location)}&days=3&aqi=yes&alerts=yes`
  );
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  return response.json();
};

export const getAirQuality = async (location: string): Promise<AirQuality> => {
  const response = await fetch(
    `${WEATHER_API_BASE}/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(location)}&aqi=yes`
  );
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.current.air_quality;
};

export const getSportsSchedule = async (location: string): Promise<any> => {
  // WeatherAPI sports endpoint
  const response = await fetch(
    `${WEATHER_API_BASE}/sports.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(location)}`
  );
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  return response.json();
};

export const getAstronomy = async (location: string, date?: string): Promise<any> => {
  const dateParam = date || new Date().toISOString().split('T')[0];
  const response = await fetch(
    `${WEATHER_API_BASE}/astronomy.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(location)}&dt=${dateParam}`
  );
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  return response.json();
};

export const formatWeatherForAI = (weather: WeatherForecast): string => {
  const { location, current, forecast } = weather;
  
  let context = `\n\n--- WEATHER CONTEXT ---\n`;
  context += `Location: ${location.name}, ${location.region}\n`;
  context += `Current: ${current.temp_c}°C, ${current.condition.text}\n`;
  context += `Feels like: ${current.feelslike_c}°C\n`;
  context += `Wind: ${current.wind_kph} km/h\n`;
  context += `Humidity: ${current.humidity}%\n`;
  context += `UV Index: ${current.uv}\n\n`;
  
  context += `3-Day Forecast:\n`;
  forecast.forecastday.forEach((day, i) => {
    context += `Day ${i + 1} (${day.date}): ${day.day.mintemp_c}°C - ${day.day.maxtemp_c}°C, ${day.day.condition.text}\n`;
    context += `  Rain chance: ${day.day.daily_chance_of_rain}%, Wind: ${day.day.maxwind_kph} km/h\n`;
  });
  
  return context;
};
