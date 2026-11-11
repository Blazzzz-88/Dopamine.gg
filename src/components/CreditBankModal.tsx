import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, ShieldCheck, Sparkles, X } from 'lucide-react';
import { formatCredits } from '../utils/rng';

interface CreditBankModalProps {
  isOpen: boolean;
  balance: number;
  onClaim: (amount: number) => void;
  onClose: () => void;
}

const PACKS = [
  {
    amount: 1000,
    title: 'Recharge Standard',
    subtitle: 'Idéal pour les caisses tactiques',
  },
  {
    amount: 5000,
    title: 'Pack Avant-Garde',
    subtitle: 'Parfait pour plusieurs ouvertures 3x',
  },
  {
    amount: 25000,
    title: 'Coffre High-Roller',
    subtitle: 'Pour chasser le Secret (0,025%) sans limite',
  },
];

export const CreditBankModal: React.FC<CreditBankModalProps> = ({
  isOpen,
  balance,
  onClaim,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="vault-card relative w-full max-w-lg overflow-hidden rounded-3xl p-6 shadow-2xl sm:p-7"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-xl border border-accent-500/20 bg-surface-base/70 p-2 text-accent-200/70 transition hover:text-accent-100"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              BANQUE FICTIVE GRATUITE
            </div>

            <h2 className="mt-3 font-display text-2xl font-bold text-accent-50">
              Recharger votre solde virtuel
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-accent-100/65">
              Aucun paiement ni argent réel n’existe sur ce site. Choisissez un montant de{' '}
              <strong>crédits fictifs (CR)</strong> à créditer immédiatement sur votre compte de simulation.
            </p>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-accent-500/15 bg-surface-base px-4 py-2.5 text-xs">
              <span className="text-accent-200/60">Solde actuel</span>
              <span className="font-mono-num text-sm font-bold text-accent-300">
                {formatCredits(balance)}
              </span>
            </div>

            <div className="mt-5 space-y-2.5">
              {PACKS.map((pack) => (
                <button
                  key={pack.amount}
                  onClick={() => {
                    onClaim(pack.amount);
                    onClose();
                  }}
                  className="group flex w-full items-center justify-between rounded-2xl border border-accent-500/20 bg-surface-panel p-4 text-left transition hover:border-accent-400/60 hover:bg-accent-500/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 transition group-hover:bg-accent-400 group-hover:text-accent-950">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-display text-sm font-bold text-accent-50">
                        {pack.title}
                      </div>
                      <div className="text-[11px] text-accent-100/55">{pack.subtitle}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-accent-400/15 px-3 py-1.5 font-mono-num text-xs font-extrabold text-accent-300 group-hover:bg-accent-400 group-hover:text-accent-950">
                    <Sparkles className="h-3 w-3" />+{formatCredits(pack.amount)}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
