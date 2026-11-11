import React, { createContext, useCallback, useContext, useState } from 'react';
import { SkinDefinition, WearTier } from '../types/casino';

export type InspectableWeapon = Omit<SkinDefinition, 'id' | 'baseValue'> & {
  id?: string;
  skinId?: string;
  baseValue?: number;
  floatVal?: number;
  wear?: WearTier;
  value?: number;
  locked?: boolean;
};

interface WeaponInspectorContextValue {
  inspectedWeapon: InspectableWeapon | null;
  inspectWeapon: (weapon: InspectableWeapon) => void;
  closeInspector: () => void;
}

const WeaponInspectorContext = createContext<WeaponInspectorContextValue>({
  inspectedWeapon: null,
  inspectWeapon: () => {},
  closeInspector: () => {},
});

export const WeaponInspectorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inspectedWeapon, setInspectedWeapon] = useState<InspectableWeapon | null>(null);

  const inspectWeapon = useCallback((weapon: InspectableWeapon) => {
    setInspectedWeapon(weapon);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectedWeapon(null);
  }, []);

  return (
    <WeaponInspectorContext.Provider
      value={{ inspectedWeapon, inspectWeapon, closeInspector }}
    >
      {children}
    </WeaponInspectorContext.Provider>
  );
};

export function useWeaponInspector(): WeaponInspectorContextValue {
  return useContext(WeaponInspectorContext);
}
