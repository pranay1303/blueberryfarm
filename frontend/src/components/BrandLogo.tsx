import React from 'react';
import blueberryLogo from '../assets/blueberry-logo.png';

export const BrandLogo: React.FC<{ size?: number | 'sm' | 'md' | 'lg' | 'xl'; className?: string }> = ({
  size = 44,
  className = '',
}) => {
  const sizeMap: Record<string, number> = { sm: 32, md: 44, lg: 60, xl: 80 };
  const pixelSize = typeof size === 'number' ? size : sizeMap[size] || 44;
  return (
    <img
      src={blueberryLogo}
      alt="Blueberry Farm and Resort Logo"
      style={{ width: pixelSize, height: pixelSize }}
      className={`rounded-full object-contain shrink-0 ${className}`}
    />
  );
};

