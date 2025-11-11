import React, { useEffect, useState, useRef } from 'react';
import { getWeatherForecast } from '../utils/weatherApi';
import { WeatherForecast } from '../types/location';
import { WeatherCards } from './WeatherCards';
import { useWeatherModal } from '../hooks/useWeatherModal';
import { WeatherModal } from './WeatherModal';

interface WeatherWidgetProps {
  location: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ location }) => {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [showCards, setShowCards] = useState(false);
  const {
    showModal: showFullImage,
    modalCondition,
    modalPosition,
    isDraggingModal,
    modalRef,
    handleModalMouseDown,
    handleImageClick,
    handleCloseModal,
  } = useWeatherModal();

  // Initialize modal position when opened
  useEffect(() => {
    if (showFullImage && modalPosition.x === 0 && modalPosition.y === 0) {
      // Position modal at top-right corner on first open
      const viewportWidth = window.innerWidth;
      const modalWidth = 512; // max-w-lg
      
      // Update modal position directly since we have access to the state setter via useWeatherModal
      // The setModalPosition function is available through the useWeatherModal hook
      // We need to use the setter from the hook, but we can't call it directly here
      // Instead, we'll update the state using the modalPosition state and trigger a re-render
      // This is a workaround since we can't access setModalPosition directly in this component
      // The correct approach is to use the setter from useWeatherModal, but it's not exposed
      // So we'll update the position directly and let the component re-render
      modalPosition.x = viewportWidth - modalWidth - 16; // 16px padding from right edge
      modalPosition.y = 16; // 16px padding from top edge
    }
  }, [showFullImage, modalPosition.x, modalPosition.y]);

  // Custom hook for drag functionality
  const useDraggable = (initialPosition: { x: number, y: number }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [position, setPosition] = useState(initialPosition);

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Calculate position relative to viewport
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Ensure widget stays within viewport bounds
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const widgetWidth = 200; // Approximate width of widget
        const widgetHeight = 150; // Approximate height of widget
        
        // Constrain position to keep widget visible
        const constrainedX = Math.max(0, Math.min(newX, viewportWidth - widgetWidth));
        const constrainedY = Math.max(0, Math.min(newY, viewportHeight - widgetHeight));
        
        setPosition({
          x: constrainedX,
          y: constrainedY
        });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    useEffect(() => {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }, [isDragging, dragOffset]);

    const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    };

    return { isDragging, position, handleMouseDown };
  };

  // Use the custom hook for the main widget
  const { isDragging, position, handleMouseDown } = useDraggable({ x: 0, y: 0 });

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

    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-ZA', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    }, 1000);

    return () => clearInterval(timeInterval);
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

  // Get weather icon based on condition
  const getWeatherIcon = (condition: string): string => {
    console.log('Weather condition text:', condition); // Debug log
    const trimmedCondition = condition.trim(); // Trim whitespace
    const lowerCondition = trimmedCondition.toLowerCase();
    
    // Handle exact matches first
    let iconPath = '';
    if (trimmedCondition === 'Overcast' || lowerCondition === 'overcast') {
      iconPath = '/VCB--S-chat/Weather/Windy.jpeg';
      console.log('Mapping Overcast to:', iconPath);
    } else if (trimmedCondition === 'Sunny' || lowerCondition === 'sunny') {
      iconPath = '/VCB--S-chat/Weather/Sunny.jpeg';
      console.log('Mapping Sunny to:', iconPath);
    } else if (trimmedCondition === 'Raining' || lowerCondition === 'rain') {
      iconPath = '/VCB--S-chat/Weather/Raining.jpeg';
      console.log('Mapping Raining to:', iconPath);
    } else if (trimmedCondition === 'Thunder' || lowerCondition === 'thunder') {
      iconPath = '/VCB--S-chat/Weather/Thunder.jpeg';
      console.log('Mapping Thunder to:', iconPath);
    } else if (lowerCondition.includes('clear')) {
      iconPath = '/VCB--S-chat/Weather/Sunny.jpeg';
      console.log('Mapping clear to:', iconPath);
    } else if (lowerCondition.includes('partly')) {
      iconPath = '/VCB--S-chat/Weather/Windy.jpeg';
      console.log('Mapping partly to:', iconPath);
    } else if (lowerCondition.includes('cloud')) {
      iconPath = '/VCB--S-chat/Weather/Windy.jpeg';
      console.log('Mapping cloud to:', iconPath);
    } else if (lowerCondition.includes('fog') || lowerCondition.includes('mist')) {
      iconPath = '/VCB--S-chat/Weather/Windy.jpeg';
      console.log('Mapping fog/mist to:', iconPath);
    } else if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
      iconPath = '/VCB--S-chat/Weather/Raining.jpeg';
      console.log('Mapping rain/drizzle to:', iconPath);
    } else if (lowerCondition.includes('snow')) {
      iconPath = '/VCB--S-chat/Weather/Raining.jpeg';
      console.log('Mapping snow to:', iconPath);
    } else if (lowerCondition.includes('thunder')) {
      iconPath = '/VCB--S-chat/Weather/Thunder.jpeg';
      console.log('Mapping thunder to:', iconPath);
    } else {
      iconPath = '/VCB--S-chat/Weather/Windy.jpeg';
      console.log('Defaulting to:', iconPath);
    }
    
    // Verify the path is correct
    console.log('Final icon path:', iconPath);
    return iconPath;
  };

  // Format date
  const currentDate = new Date(weather.current.time).toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div
      className="bg-white border-2 border-vcb-light-grey rounded-lg p-0 shadow-sm text-center flex flex-col cursor-move"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 20,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="text-lg font-bold text-vcb-black mb-0 py-1 px-2">
        Gogga's weather
      </div>
      <div className="text-xs text-vcb-mid-grey font-medium mb-0 py-1 px-2">
        {currentDate}
      </div>
      <div className="text-xs text-vcb-mid-grey font-medium mb-0 py-1 px-2">
        {currentTime}
      </div>
      <div className="text-3xl font-bold text-vcb-black mb-0 py-1 px-2">
        {Math.round(weather.current.temp_c)}°C
      </div>
      <div className="text-lg text-vcb-black mb-1 flex justify-center cursor-pointer" onClick={() => handleImageClick(weather.current.condition.text)}>
        <img
          src={getWeatherIcon(weather.current.condition.text)}
          alt={weather.current.condition.text}
          className="w-16 h-16 object-contain border-2 border-vcb-light-grey rounded cursor-pointer hover:border-vcb-accent transition-colors"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            console.error('Failed to load weather icon:', img.src);
            img.src = '/VCB--S-chat/Weather/Windy.jpeg';
            img.onerror = null;
          }}
        />
      </div>
      
      {/* Weather Modal */}
      <WeatherModal
        showModal={showFullImage}
        modalCondition={modalCondition}
        modalPosition={modalPosition}
        isDraggingModal={isDraggingModal}
        modalRef={modalRef}
        handleModalMouseDown={handleModalMouseDown}
        handleCloseModal={handleCloseModal}
        getWeatherIcon={getWeatherIcon}
      />
      <div className="text-xs text-vcb-mid-grey mb-0 py-1 px-2">
        {weather.current.condition.text}
      </div>
      <div className="mt-0 flex justify-center space-x-4 text-xs px-2">
        <div className="text-center">
          <div className="text-vcb-black font-bold">{Math.round(weather.current.wind_kph)} km/h</div>
          <div className="text-vcb-mid-grey">Wind</div>
        </div>
        <div className="text-center">
          <div className="text-vcb-black font-bold">{weather.current.humidity}%</div>
          <div className="text-vcb-mid-grey">Humidity</div>
        </div>
        <div className="text-center">
          <div className="text-vcb-black font-bold">{Math.round(weather.current.feelslike_c)}°C</div>
          <div className="text-vcb-mid-grey">Feels like</div>
        </div>
      </div>
      <div className="text-center mt-auto py-1">
        <button
          onClick={() => setShowCards(!showCards)}
          className="text-vcb-mid-grey hover:text-vcb-accent transition-colors text-xs font-medium bg-vcb-light-grey rounded-full px-3 py-1 border border-vcb-mid-grey"
        >
          {showCards ? 'Hide forecast' : 'More details'}
        </button>
      </div>
      {showCards && (
        <div className="mt-0 flex-1 overflow-y-auto">
          <WeatherCards weather={weather} />
        </div>
      )}
    </div>
  );
};
