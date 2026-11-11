import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, UserPlus, X, LogOut, User, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SupabaseUser | null;
  currentUsername: string | null;
  onAuthSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentUsername,
  onAuthSuccess,
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isSignUp) {
        if (!username.trim()) {
          setErrorMsg('Veuillez renseigner un pseudo.');
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          // Créer le profil initial avec exactement 3000 crédits et 25 de stockage de base
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username.trim(),
            credits: 3000,
            storage_limit: 25,
            inventory: [],
            drop_history: [],
            stats: {},
            updated_at: new Date().toISOString(),
          });

          setSuccessMsg('Compte créé avec succès ! Vos données sont désormais sauvegardées dans le cloud.');
          setTimeout(() => {
            onAuthSuccess();
            onClose();
          }, 1500);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setSuccessMsg('Connexion réussie ! Vos données sont synchronisées.');
        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Une erreur est survenue lors de la connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    onAuthSuccess();
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md p-6 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl text-slate-100"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {currentUser ? (
            /* Connected state */
            <div className="text-center space-y-5 py-2">
              <div className="inline-flex p-3 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Mon Compte Cloud</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Connecté en tant que <span className="text-emerald-400 font-semibold">{currentUsername || currentUser.email}</span>
                </p>
                <div className="mt-2 text-xs text-slate-400 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                  <span className="flex items-center justify-center gap-1.5 text-emerald-300 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Sauvegarde Cloud Active
                  </span>
                  Vos skins et crédits sont automatiquement synchronisés sur le serveur.
                </div>
              </div>

              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full py-2.5 px-4 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-semibold rounded-xl transition"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Se déconnecter
              </button>
            </div>
          ) : (
            /* Auth Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-6">
                <div className="inline-flex p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {isSignUp ? 'Créer un compte Joueur' : 'Connexion Cloud'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sauvegardez vos crédits et vos skins même en changeant d'appareil !
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs bg-rose-950/60 border border-rose-500/50 text-rose-300 rounded-lg">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="p-3 text-xs bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 rounded-lg">
                  {successMsg}
                </div>
              )}

              {isSignUp && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Pseudo en jeu</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: GhostRider"
                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@exemple.com"
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-5 h-5" /> S'inscrire & Sauvegarder
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" /> Se connecter
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition"
                >
                  {isSignUp
                    ? 'Déjà un compte ? Connectez-vous'
                    : "Pas encore de compte ? S'inscrire gratuitement"}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
