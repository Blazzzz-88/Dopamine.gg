import React from 'react';
import { CrosshairConfig } from '../utils/pvpSettings';

interface PvpCrosshairProps {
  config: CrosshairConfig;
  className?: string;
}

export const PvpCrosshair: React.FC<PvpCrosshairProps> = ({ config, className = '' }) => {
  const { style, color, size, thickness, gap, outline } = config;
  const shadow = outline ? '0 0 2px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,0.95)' : 'none';
  const showLines = style === 'cross' || style === 'cross-dot';
  const showDot = style === 'dot' || style === 'cross-dot' || style === 'circle';
  const showCircle = style === 'circle';

  const dotSize = Math.max(2, thickness + (style === 'dot' ? 2 : 1));
  const circleDiameter = size * 2 + gap * 2;

  return (
    <div
      className={`pointer-events-none relative flex items-center justify-center ${className}`}
      style={{ width: 48, height: 48 }}
      aria-label="Crosshair"
    >
      {showLines && (
        <>
          {/* Top */}
          <span
            style={{
              position: 'absolute',
              width: thickness,
              height: size,
              backgroundColor: color,
              boxShadow: shadow,
              transform: `translateY(-${gap + size / 2}px)`,
              borderRadius: 1,
            }}
          />
          {/* Bottom */}
          <span
            style={{
              position: 'absolute',
              width: thickness,
              height: size,
              backgroundColor: color,
              boxShadow: shadow,
              transform: `translateY(${gap + size / 2}px)`,
              borderRadius: 1,
            }}
          />
          {/* Left */}
          <span
            style={{
              position: 'absolute',
              width: size,
              height: thickness,
              backgroundColor: color,
              boxShadow: shadow,
              transform: `translateX(-${gap + size / 2}px)`,
              borderRadius: 1,
            }}
          />
          {/* Right */}
          <span
            style={{
              position: 'absolute',
              width: size,
              height: thickness,
              backgroundColor: color,
              boxShadow: shadow,
              transform: `translateX(${gap + size / 2}px)`,
              borderRadius: 1,
            }}
          />
        </>
      )}

      {showCircle && (
        <span
          style={{
            position: 'absolute',
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: '9999px',
            border: `${thickness}px solid ${color}`,
            boxShadow: shadow,
          }}
        />
      )}

      {showDot && (
        <span
          style={{
            position: 'absolute',
            width: dotSize,
            height: dotSize,
            borderRadius: '9999px',
            backgroundColor: color,
            boxShadow: shadow,
          }}
        />
      )}
    </div>
  );
};
