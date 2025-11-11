import React from 'react';
import { WeatherForecast } from '../types/location';
import { useWeatherModal } from '../hooks/useWeatherModal';
import { WeatherModal } from './WeatherModal';

interface WeatherCardsProps {
  weather: WeatherForecast;
}

export const WeatherCards: React.FC<WeatherCardsProps> = ({ weather }) => {
  const {
    showModal,
    modalCondition,
    modalPosition,
    isDraggingModal,
    modalRef,
    handleModalMouseDown,
    handleImageClick,
    handleCloseModal,
  } = useWeatherModal();
  // Get weather icon based on condition
  const getWeatherIcon = (condition: string): string => {
    const trimmedCondition = condition.trim();
    const lowerCondition = trimmedCondition.toLowerCase();
    
    if (trimmedCondition === 'Overcast' || lowerCondition === 'overcast') {
      return '/VCB--S-chat/Weather/Windy.jpeg';
    } else if (trimmedCondition === 'Sunny' || lowerCondition === 'sunny') {
      return '/VCB--S-chat/Weather/Sunny.jpeg';
    } else if (trimmedCondition === 'Raining' || lowerCondition === 'rain') {
      return '/VCB--S-chat/Weather/Raining.jpeg';
    } else if (trimmedCondition === 'Thunder' || lowerCondition === 'thunder') {
      return '/VCB--S-chat/Weather/Thunder.jpeg';
    } else if (lowerCondition.includes('clear')) {
      return '/VCB--S-chat/Weather/Sunny.jpeg';
    } else if (lowerCondition.includes('partly')) {
      return '/VCB--S-chat/Weather/Windy.jpeg';
    } else if (lowerCondition.includes('cloud')) {
      return '/VCB--S-chat/Weather/Windy.jpeg';
    } else if (lowerCondition.includes('fog') || lowerCondition.includes('mist')) {
      return '/VCB--S-chat/Weather/Windy.jpeg';
    } else if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
      return '/VCB--S-chat/Weather/Raining.jpeg';
    } else if (lowerCondition.includes('snow')) {
      return '/VCB--S-chat/Weather/Raining.jpeg';
    } else if (lowerCondition.includes('thunder')) {
      return '/VCB--S-chat/Weather/Thunder.jpeg';
    } else {
      return '/VCB--S-chat/Weather/Windy.jpeg';
    }
  };

  return (
    <div className="bg-white border-2 border-vcb-light-grey rounded-lg p-4 shadow-sm">
      <div className="text-lg font-bold text-vcb-black mb-4">
        Gogga's weather forecast
      </div>
      <div className="max-h-72 overflow-y-auto pr-2">
        {weather.forecast.forecastday.map((day, index) => {
          const date = new Date(day.date);
          const dayName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
          const dayOfMonth = date.toLocaleDateString('en-ZA', { day: 'numeric' });
          const month = date.toLocaleDateString('en-ZA', { month: 'short' });
          
          return (
            <div
              key={index}
              className="bg-vcb-light-grey rounded-lg p-3 border border-vcb-mid-grey hover:border-vcb-accent transition-colors mb-3 last:mb-0"
            >
              <div className="text-xs font-medium text-vcb-black mb-1">
                {dayName}
              </div>
              <div className="text-xs text-vcb-mid-grey mb-2">
                {dayOfMonth} {month}
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-1 text-left">
                  <div className="text-sm font-bold text-vcb-black">
                    {Math.round(day.day.maxtemp_c)}°C
                  </div>
                  <div className="text-xs text-vcb-mid-grey">
                    {Math.round(day.day.mintemp_c)}°C
                  </div>
                  <div className="text-xs text-vcb-mid-grey mt-1">
                    {day.day.condition.text}
                  </div>
                </div>
                <img
                  src={getWeatherIcon(day.day.condition.text)}
                  alt={day.day.condition.text}
                  className="w-12 h-12 object-contain cursor-pointer hover:scale-110 transition-transform"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImageClick(day.day.condition.text);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Weather Modal */}
      <WeatherModal
        showModal={showModal}
        modalCondition={modalCondition}
        modalPosition={modalPosition}
        isDraggingModal={isDraggingModal}
        modalRef={modalRef}
        handleModalMouseDown={handleModalMouseDown}
        handleCloseModal={handleCloseModal}
        getWeatherIcon={getWeatherIcon}
      />
    </div>
  );
};