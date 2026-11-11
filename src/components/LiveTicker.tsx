import React from 'react';
import { Radio } from 'lucide-react';
import { RARITIES } from '../data/rarities';
import { DropHistoryItem } from '../types/casino';
import { formatCredits } from '../utils/rng';

interface LiveTickerProps {
  drops: DropHistoryItem[];
}

export const LiveTicker: React.FC<LiveTickerProps> = ({ drops }) => {
  if (drops.length === 0) return null;

  const doubled = [...drops, ...drops];

  return (
    <div className="relative overflow-hidden border-b border-accent-500/10 bg-surface-panel/90 py-2">
      <div className="flex items-center">
        <div className="z-10 flex shrink-0 items-center gap-2 border-r border-accent-500/15 bg-surface-panel px-4 py-1 text-xs font-semibold text-accent-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
          </span>
          <Radio className="h-3.5 w-3.5 text-accent-400" />
          <span className="hidden tracking-wide sm:inline">TIRAGES EN DIRECT</span>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className="animate-ticker gap-3 px-4">
            {doubled.map((item, idx) => {
              const rarity = RARITIES[item.rarity];
              return (
                <div
                  key={`${item.id}-${idx}`}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-1 text-xs transition duration-200 hover:scale-[1.03] ${
                    item.isPlayer
                      ? 'animate-aura-pulse border-accent-400/60 bg-accent-500/15'
                      : item.rarity === 'secret' || item.rarity === 'legendaire'
                      ? 'border-amber-400/45 bg-amber-500/10 shadow-[0_0_14px_rgba(251,191,36,0.2)]'
                      : 'border-accent-500/10 bg-surface-card/80'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: rarity.color,
                      boxShadow: `0 0 8px ${rarity.color}`,
                    }}
                  />
                  <span className="font-semibold text-accent-50">
                    {item.isPlayer ? 'VOUS' : item.playerName}
                  </span>
                  <span className="text-accent-200/45">•</span>
                  <span className="font-medium" style={{ color: rarity.color }}>
                    {item.weaponName} | {item.skinName}
                  </span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono-num text-[10px] text-accent-200/70">
                    {formatCredits(item.value)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-surface-panel to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface-panel to-transparent" />
        </div>
      </div>
    </div>
  );
};
