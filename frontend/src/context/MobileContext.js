import React, { createContext, useContext, useState, useEffect } from 'react';

const MobileContext = createContext();

export const MobileProvider = ({ children }) => {
  const [forceMobileView, setForceMobileView] = useState(() => {
    const saved = localStorage.getItem('lumix-mobile-view');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('lumix-mobile-view', forceMobileView.toString());
    
    // Adiciona/remove classe no body para aplicar estilos globais
    if (forceMobileView) {
      document.body.classList.add('mobile-mode');
      // Força o viewport a não permitir zoom
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
      }
    } else {
      document.body.classList.remove('mobile-mode');
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1');
      }
    }
  }, [forceMobileView]);

  const toggleMobileView = () => {
    setForceMobileView(prev => !prev);
  };

  return (
    <MobileContext.Provider value={{ forceMobileView, toggleMobileView }}>
      {children}
    </MobileContext.Provider>
  );
};

export const useMobile = () => {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error('useMobile must be used within MobileProvider');
  }
  return context;
};
