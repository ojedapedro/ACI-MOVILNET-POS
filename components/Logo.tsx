import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <img 
    src="https://i.ibb.co/hFq3BtD9/Movilnet-logo-0.png" 
    alt="ACI Movilnet" 
    className={`object-contain ${className}`} 
  />
);