import { useState, useEffect, useRef } from 'react';

interface UseWeatherModalReturn {
  showModal: boolean;
  modalCondition: string;
  modalPosition: { x: number; y: number };
  isDraggingModal: boolean;
  modalRef: React.RefObject<HTMLDivElement>;
  handleModalMouseDown: (e: React.MouseEvent) => void;
  handleImageClick: (condition: string) => void;
  handleCloseModal: () => void;
}

export const useWeatherModal = (): UseWeatherModalReturn => {
  const [showModal, setShowModal] = useState(false);
  const [modalCondition, setModalCondition] = useState('');
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Position modal at top-right when opened, reset position when closed
  useEffect(() => {
    if (!showModal) {
      console.log('Resetting modal position');
      setModalPosition({ x: 0, y: 0 });
      return;
    }

    if (!modalRef.current) {
      console.warn('Modal ref not available for positioning');
      return;
    }

    const modalElement = modalRef.current;
    let observer: ResizeObserver | null = null;

    const positionModal = () => {
      if (modalElement.clientWidth > 0 && modalElement.clientHeight > 0) {
        const viewportWidth = window.innerWidth;
        const modalWidth = modalElement.clientWidth;
        const newX = viewportWidth - modalWidth - 16;
        const newY = 16;
        console.log(`Positioning modal: x=${newX}, y=${newY}`);
        setModalPosition({ x: newX, y: newY });
        observer?.disconnect();
      }
    };

    // Use ResizeObserver to detect when dimensions become available
    observer = new ResizeObserver(positionModal);
    observer.observe(modalElement);

    // Fallback timeout in case ResizeObserver doesn't trigger
    const timeoutId = setTimeout(() => {
      positionModal();
    }, 100);

    return () => {
      observer?.disconnect();
      clearTimeout(timeoutId);
    };
  }, [showModal]);

  // Modal drag handlers
  const handleModalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingModal(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  // Log actual CSS positioning after state update
  useEffect(() => {
    console.log('[CSS Positioning Effect] Running...');
    console.log('CSS positioning effect triggered', { modalPosition, showModal });
    console.log('[Ref Check] modalRef.current:', modalRef.current);
    
    if (showModal && modalRef.current) {
      const style = modalRef.current.style;
      style.transform = `translate(${modalPosition.x}px, ${modalPosition.y}px)`;
      console.log('Applied CSS transform:', style.transform);
    } else {
      console.log('Skipping style application because modal is not open or ref not available');
    }
    if (!modalRef.current) {
      console.warn('Modal ref not available in CSS positioning effect');
      return;
    }
    if (!showModal) {
      console.log('Modal not shown, skipping CSS check');
      return;
    }

    const modalElement = modalRef.current;
    const computedStyle = window.getComputedStyle(modalElement);
    const left = computedStyle.getPropertyValue('left');
    const top = computedStyle.getPropertyValue('top');
    console.log(`Applied CSS positioning: left=${left}, top=${top}`);
  }, [modalPosition, showModal, modalRef.current]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingModal && modalRef.current) {
        // Calculate new position with smooth tracking
        const newPosition = {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        };
        
        // Get actual modal dimensions for precise constraints
        const modalRect = modalRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Add some margin for better visual experience
        const margin = 10;
        
        // Constrain to viewport with margins
        newPosition.x = Math.max(
          margin, 
          Math.min(newPosition.x, viewportWidth - modalRect.width - margin)
        );
        newPosition.y = Math.max(
          margin, 
          Math.min(newPosition.y, viewportHeight - modalRect.height - margin)
        );
        
        // Smooth position update
        requestAnimationFrame(() => {
          setModalPosition(newPosition);
        });
        
        setModalPosition(newPosition);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingModal(false);
    };

    if (isDraggingModal) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingModal, dragStart]);

  const handleImageClick = (condition: string) => {
    setModalCondition(condition);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  return {
    showModal,
    modalCondition,
    modalPosition,
    isDraggingModal,
    modalRef,
    handleModalMouseDown,
    handleImageClick,
    handleCloseModal,
  };
};