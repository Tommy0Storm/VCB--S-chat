export interface LocalPlace {
  position: number;
  title: string;
  rating?: number;
  reviews?: number;
  price?: string;
  description?: string;
  thumbnail?: string;
  address?: string;
  type?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  place_id?: string;
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
    time: string; // ISO 8601 format time from Open-Meteo API
  };
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
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
      };
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