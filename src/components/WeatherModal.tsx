import React from 'react';

interface WeatherModalProps {
  showModal: boolean;
  modalCondition: string;
  modalPosition: { x: number; y: number };
  isDraggingModal: boolean;
  modalRef: React.RefObject<HTMLDivElement>;
  handleModalMouseDown: (e: React.MouseEvent) => void;
  handleCloseModal: () => void;
  getWeatherIcon: (condition: string) => string;
}

export const WeatherModal: React.FC<WeatherModalProps> = ({
  showModal,
  modalCondition,
  modalPosition,
  isDraggingModal,
  modalRef,
  handleModalMouseDown,
  handleCloseModal,
  getWeatherIcon,
}) => {
  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 z-50 transition-opacity duration-300 ease-in-out"
      onClick={handleCloseModal}
      style={{
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={modalRef}
        className={`bg-white border-4 border-vcb-accent rounded-2xl shadow-2xl max-w-lg w-full transition-all duration-300 ease-out transform ${
          isDraggingModal ? 'cursor-grabbing scale-105 shadow-3xl' : 'cursor-grab scale-100 hover:shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: `${modalPosition.x}px`,
          top: `${modalPosition.y}px`,
          zIndex: 1000,
          transition: isDraggingModal ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseDown={handleModalMouseDown}
      >
        {/* Header with drag indicator */}
        <div className="bg-gradient-to-r from-vcb-black to-vcb-dark-grey border-b-4 border-vcb-accent px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors cursor-pointer" onClick={handleCloseModal} />
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <div className="w-3 h-3 bg-green-500 rounded-full" />
            </div>
            <h3 className="text-white font-bold text-xl uppercase tracking-wider">Weather Details</h3>
          </div>
          <button
            onClick={handleCloseModal}
            className="text-white hover:text-vcb-accent transition-all duration-200 transform hover:scale-110"
            title="Close"
          >
            <span className="material-icons text-3xl">close</span>
          </button>
        </div>
        
        {/* Image container with improved styling */}
        <div className="bg-gradient-to-br from-vcb-light-grey to-white p-8 flex justify-center items-center min-h-[300px]">
          <div className="relative group">
            <img
              src={getWeatherIcon(modalCondition)}
              alt={modalCondition}
              className="max-w-full max-h-80 object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-lg"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                console.error('Failed to load weather icon:', img.src);
                img.src = '/VCB--S-chat/Weather/Windy.jpeg';
                img.onerror = null;
              }}
            />
            {/* Subtle glow effect */}
            <div className="absolute inset-0 bg-vcb-accent opacity-0 group-hover:opacity-10 rounded-lg transition-opacity duration-300 blur-xl" />
          </div>
        </div>
        
        {/* Footer with condition display */}
        <div className="bg-gradient-to-r from-vcb-dark-grey to-vcb-black border-t-4 border-vcb-accent px-6 py-4 text-center rounded-b-2xl">
          <div className="flex items-center justify-center space-x-2">
            <span className="material-icons text-vcb-accent text-2xl">cloud</span>
            <p className="text-white text-lg font-semibold capitalize">{modalCondition}</p>
          </div>
          <div className="mt-2 text-vcb-light-grey text-sm">
            Drag modal to reposition • Click outside to close
          </div>
        </div>
      </div>
    </div>
  );
};