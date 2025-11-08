import React, { useEffect, useState } from 'react';
import { getWeatherForecast, WeatherForecast } from '../utils/weatherApi';

interface WeatherWidgetProps {
  location: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ location }) => {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setLoading(true);
        const data = await getWeatherForecast(location);
        setWeather(data);
        setError(null);
      } catch (err) {
        console.error('[Weather] Failed to fetch:', err);
        setError('Unable to load weather');
      } finally {
        setLoading(false);
      }
    };

    if (location) {
      fetchWeather();
    }
  }, [location]);

  if (loading) {
    return (
      <div className="bg-white border-2 border-vcb-light-grey rounded-lg p-3 shadow-sm">
        <div className="flex items-center space-x-2 text-vcb-mid-grey">
          <span className="material-icons animate-spin text-sm">autorenew</span>
          <span className="text-xs">Loading weather...</span>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4 shadow-md">
      {/* Current Weather */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-blue-200">
        <div>
          <div className="text-xs text-blue-600 font-bold uppercase tracking-wide">
            {weather.location.name}
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {Math.round(weather.current.temp_c)}°C
          </div>
          <div className="text-xs text-blue-700">
            {weather.current.condition.text}
          </div>
        </div>
        <img 
          src={`https:${weather.current.condition.icon}`} 
          alt={weather.current.condition.text}
          className="w-16 h-16"
        />
      </div>

      {/* 3-Day Forecast */}
      <div className="space-y-2">
        {weather.forecast.forecastday.map((day, index) => (
          <div 
            key={day.date} 
            className="flex items-center justify-between bg-white bg-opacity-50 rounded px-2 py-1.5"
          >
            <div className="flex items-center space-x-2 flex-1">
              <img 
                src={`https:${day.day.condition.icon}`} 
                alt={day.day.condition.text}
                className="w-8 h-8"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-blue-900">
                  {index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-xs text-blue-700 truncate">
                  {day.day.condition.text}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {day.day.daily_chance_of_rain > 30 && (
                <div className="flex items-center space-x-0.5 text-blue-600">
                  <span className="material-icons text-xs">water_drop</span>
                  <span className="text-xs font-medium">{day.day.daily_chance_of_rain}%</span>
                </div>
              )}
              <div className="text-xs font-bold text-blue-900">
                {Math.round(day.day.maxtemp_c)}°/{Math.round(day.day.mintemp_c)}°
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Weather Alerts */}
      {weather.alerts && weather.alerts.alert && weather.alerts.alert.length > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          {weather.alerts.alert.map((alert, index) => (
            <div key={index} className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              <span className="material-icons text-red-600 text-sm">warning</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-red-900">{alert.event}</div>
                <div className="text-xs text-red-700">{alert.headline}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Additional Info */}
      <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-blue-600">Wind</div>
          <div className="text-xs font-bold text-blue-900">{Math.round(weather.current.wind_kph)} km/h</div>
        </div>
        <div>
          <div className="text-xs text-blue-600">Humidity</div>
          <div className="text-xs font-bold text-blue-900">{weather.current.humidity}%</div>
        </div>
        <div>
          <div className="text-xs text-blue-600">UV Index</div>
          <div className="text-xs font-bold text-blue-900">{weather.current.uv}</div>
        </div>
      </div>
    </div>
  );
};
