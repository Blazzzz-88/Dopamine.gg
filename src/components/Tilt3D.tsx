import React, { useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';

interface Tilt3DProps {
  children: React.ReactNode;
  className?: string;
  /** Inclinaison maximale en degrés */
  max?: number;
  /** Zoom au survol */
  hoverScale?: number;
  /** Reflet lumineux qui suit le pointeur */
  glare?: boolean;
  perspective?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  'aria-label'?: string;
}

/**
 * Carte qui s'incline en 3D en suivant le pointeur.
 * Les enfants peuvent utiliser `style={{ transform: 'translateZ(40px)' }}`
 * pour sortir du plan (la carte conserve la 3D : pas d'overflow-hidden ici).
 */
export const Tilt3D: React.FC<Tilt3DProps> = ({
  children,
  className = '',
  max = 9,
  hoverScale = 1.015,
  glare = true,
  perspective = 1100,
  style,
  onClick,
  role,
  tabIndex,
  onKeyDown,
  'aria-label': ariaLabel,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const springCfg = { stiffness: 210, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), springCfg);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), springCfg);
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glareBg = useMotionTemplate`radial-gradient(520px circle at ${gx} ${gy}, rgba(255,255,255,0.16), transparent 45%)`;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType === 'touch' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };

  const reset = () => {
    setHovered(false);
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={reset}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      whileHover={reduceMotion ? undefined : { scale: hoverScale }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        rotateX: reduceMotion ? 0 : rotateX,
        rotateY: reduceMotion ? 0 : rotateY,
        transformPerspective: perspective,
        transformStyle: 'preserve-3d',
        ...style,
      }}
      className={`relative ${className}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 rounded-[inherit] transition-opacity duration-300"
          style={{ background: glareBg, opacity: hovered ? 1 : 0, transform: 'translateZ(1px)' }}
        />
      )}
    </motion.div>
  );
};
