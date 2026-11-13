import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CRATES } from './data/catalog';
import { RARITIES } from './data/rarities';
import { ThemeId } from './data/themes';
import {
  CrateDefinition,
  DropHistoryItem,
  InventoryItem,
  NavTab,
  RarityId,
} from './types/casino';
import {
  formatCredits,
  generateSeedHash,
  generateSimulatedDrop,
  randomId,
} from './utils/rng';
import { soundEngine } from './utils/sound';
import {
  createDefaultStats,
  createInitialState,
  getNextStorageUpgradeCost,
  loadPersistedState,
  PersistedState,
  savePersistedState,
  STORAGE_UPGRADE_STEP,
} from './utils/storage';
import { Navbar } from './components/Navbar';
import { LiveTicker } from './components/LiveTicker';
import { HeroBanner } from './components/HeroBanner';
import { CategorySection } from './components/CategorySection';
import { CaseOpeningView } from './components/CaseOpeningView';
import { InventoryView } from './components/InventoryView';
import { UpgraderView } from './components/UpgraderView';
import { ContractView } from './components/ContractView';
import { StatsAndGuideView } from './components/StatsAndGuideView';
import { ZombieGameView } from './components/ZombieGameView';
import { ChallengesModal } from './components/ChallengesModal';
import { WeaponInspectModal } from './components/WeaponInspectModal';
import { TypewriterText } from './components/TypewriterText';
import { AuthModal } from './components/AuthModal';
import {
  applyZombieChallengeProgress,
  DAILY_BONUS_CREDITS,
  DAILY_CHALLENGES_LIMIT,
  ensureTodayChallenges,
  getChallengeDefinition,
  ZombieChallengeEvent,
} from './utils/zombieChallenges';
import { supabase } from './utils/supabaseClient';
import {
  buildCloudBaseline,
  CloudBaseline,
  CloudProfileRow,
  hasCloudSyncedDiff,
  hydrateInventoryFromCatalog,
  mergeServerEditsIntoLocalState,
  parseSafeCloudNumber,
  sanitizeInventoryForCloud,
} from './utils/cloudSync';
import { User as SupabaseUser } from '@supabase/supabase-js';
import {
  WeaponInspectorProvider,
  useWeaponInspector,
} from './context/WeaponInspectorContext';

interface ToastMessage {
  id: string;
  text: string;
}

const GlobalInspectorModal: React.FC = () => {
  const { inspectedWeapon, closeInspector } = useWeaponInspector();
  return <WeaponInspectModal weapon={inspectedWeapon} onClose={closeInspector} />;
};

function clearRemovedEquips(prev: PersistedState, removedIds: Set<string>) {
  return {
    equippedWeaponId:
      prev.equippedWeaponId && removedIds.has(prev.equippedWeaponId) ? null : prev.equippedWeaponId,
    equippedKnifeId:
      prev.equippedKnifeId && removedIds.has(prev.equippedKnifeId) ? null : prev.equippedKnifeId,
  };
}

export function App() {
  const [persisted, setPersisted] = useState<PersistedState>(() => {
    // Si l'utilisateur avait l'ancien pack valorant pré-chargé, vider pour démarrer propre
    const state = loadPersistedState();
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('personal_valo_pack_granted_v1') &&
      state.inventory.length > 0
    ) {
      localStorage.removeItem('personal_valo_pack_granted_v1');
      return {
        ...state,
        inventory: [],
        equippedWeaponId: null,
        equippedKnifeId: null,
      };
    }
    return state;
  });
  const [pageMode, setPageMode] = useState<'casino' | 'zombie'>('casino');
  const [activeTab, setActiveTab] = useState<NavTab>('boutique');
  const [activeCrate, setActiveCrate] = useState<CrateDefinition | null>(null);
  const [upgraderSeedId, setUpgraderSeedId] = useState<string | null>(null);
  const [contractSeedId, setContractSeedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [challengesModalOpen, setChallengesModalOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'synced'>('idle');
  const pageModeRef = useRef(pageMode);
  pageModeRef.current = pageMode;
  const loadedCloudUserIdRef = useRef<string | null>(null);
  const isCloudLoadedRef = useRef<boolean>(false);
  const profileExistsRef = useRef<boolean>(false);
  const cloudBaselineRef = useRef<CloudBaseline | null>(null);
  const hasDirtyChangesRef = useRef<boolean>(false);
  const saveInFlightRef = useRef<boolean>(false);
  const queuedSaveRef = useRef<boolean>(false);
  const resolvingUpgradeIdRef = useRef<string | null>(null);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  const pushToast = useCallback((text: string) => {
    const id = randomId('toast');
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Applique les modifications faites par l'admin dans Supabase sans écraser les données locales
  const applyRemoteCloudRow = useCallback(
    (row: CloudProfileRow) => {
      if (row.username) {
        setCurrentUsername(row.username);
      }
      if (!cloudBaselineRef.current) return;

      const merged = mergeServerEditsIntoLocalState(
        persistedRef.current,
        cloudBaselineRef.current,
        row
      );
      if (!merged.adminChanged) return;

      cloudBaselineRef.current = merged.nextBaseline;
      hasDirtyChangesRef.current = false;
      setPersisted(merged.nextState);
      savePersistedState(merged.nextState, currentUser?.id);

      if (merged.creditsDeltaFromAdmin > 0) {
        pushToast(`+${formatCredits(merged.creditsDeltaFromAdmin)} reçus sur votre compte !`);
      }
    },
    [pushToast, currentUser]
  );

  // Fonction de sauvegarde immédiate vers Supabase avec fusion anti-écrasement admin
  const saveToCloudNow = useCallback(
    async (stateToSave?: PersistedState) => {
      if (!currentUser || !isCloudLoadedRef.current) return;
      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        return;
      }

      const current = stateToSave || persistedRef.current;
      if (profileExistsRef.current && !hasCloudSyncedDiff(current, cloudBaselineRef.current)) {
        hasDirtyChangesRef.current = false;
        setCloudSyncStatus('synced');
        return;
      }

      saveInFlightRef.current = true;
      setCloudSyncStatus('saving');

      try {
        let stateToWrite = current;
        let adminCreditsDelta = 0;
        let adminUpdatedDuringSave = false;

        if (profileExistsRef.current && cloudBaselineRef.current) {
          const { data: latestRow } = await supabase
            .from('profiles')
            .select('id,username,credits,inventory,drop_history,stats,storage_limit')
            .eq('id', currentUser.id)
            .single();

          if (latestRow) {
            const merged = mergeServerEditsIntoLocalState(
              current,
              cloudBaselineRef.current,
              latestRow as CloudProfileRow
            );
            stateToWrite = merged.nextState;
            adminCreditsDelta = merged.creditsDeltaFromAdmin;
            adminUpdatedDuringSave = merged.adminChanged;
          }
        }

        const payload = {
          credits: stateToWrite.balance,
          inventory: sanitizeInventoryForCloud(stateToWrite.inventory),
          drop_history: stateToWrite.history,
          stats: stateToWrite.stats,
          storage_limit: stateToWrite.inventoryCapacity,
          updated_at: new Date().toISOString(),
        };

        const { error } = profileExistsRef.current
          ? await supabase.from('profiles').update(payload).eq('id', currentUser.id)
          : await supabase.from('profiles').upsert({
              id: currentUser.id,
              username: currentUsername || currentUser.email?.split('@')[0] || 'Joueur',
              ...payload,
            });

        if (error) {
          console.warn('Erreur sauvegarde Supabase:', error.message);
          setCloudSyncStatus('idle');
        } else {
          profileExistsRef.current = true;
          cloudBaselineRef.current = buildCloudBaseline(stateToWrite);
          hasDirtyChangesRef.current = false;
          setCloudSyncStatus('synced');

          if (adminUpdatedDuringSave) {
            setPersisted(stateToWrite);
            savePersistedState(stateToWrite, currentUser.id);
            if (adminCreditsDelta > 0) {
              pushToast(`+${formatCredits(adminCreditsDelta)} reçus sur votre compte !`);
            }
          }
        }
      } catch (err) {
        console.warn('Exception sauvegarde cloud:', err);
        setCloudSyncStatus('idle');
      } finally {
        saveInFlightRef.current = false;
        if (queuedSaveRef.current) {
          queuedSaveRef.current = false;
          void saveToCloudNow(persistedRef.current);
        }
      }
    },
    [currentUser, currentUsername, pushToast]
  );

  // Sauvegarde avant fermeture UNIQUEMENT s'il y a des modifications locales non encore envoyées
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser && isCloudLoadedRef.current && hasDirtyChangesRef.current) {
        void saveToCloudNow(persistedRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser, saveToCloudNow]);

  // Charger la session Supabase et écouter les changements
  const loadCloudProfile = useCallback(async (user: SupabaseUser) => {
    setCloudSyncStatus('saving');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erreur Supabase:', error);
        setCloudSyncStatus('idle');
        return;
      }

      if (data) {
        profileExistsRef.current = true;
        setCurrentUsername(data.username || null);
        const cloudState: PersistedState = {
          ...persistedRef.current,
          balance: parseSafeCloudNumber(data.credits, 3000),
          inventory: Array.isArray(data.inventory)
            ? hydrateInventoryFromCatalog(data.inventory)
            : [],
          inventoryCapacity: parseSafeCloudNumber(data.storage_limit, 25),
          history: Array.isArray(data.drop_history) ? data.drop_history : persistedRef.current.history,
          stats:
            data.stats && typeof data.stats === 'object'
              ? { ...persistedRef.current.stats, ...data.stats }
              : persistedRef.current.stats,
        };
        cloudBaselineRef.current = buildCloudBaseline(cloudState);
        hasDirtyChangesRef.current = false;
        setPersisted(cloudState);
        savePersistedState(cloudState, user.id);
        isCloudLoadedRef.current = true;
        setCloudSyncStatus('synced');
      } else {
        // Nouveau profil à initialiser dans la base
        profileExistsRef.current = false;
        cloudBaselineRef.current = buildCloudBaseline(persistedRef.current);
        hasDirtyChangesRef.current = false;
        isCloudLoadedRef.current = true;
        setCloudSyncStatus('synced');
      }
    } catch (e) {
      console.warn('Impossible de charger le profil cloud:', e);
      setCloudSyncStatus('idle');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user && loadedCloudUserIdRef.current !== user.id) {
        const userLocalState = loadPersistedState(user.id);
        setPersisted(userLocalState);
        persistedRef.current = userLocalState;
        loadedCloudUserIdRef.current = user.id;
        loadCloudProfile(user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user) {
        if (loadedCloudUserIdRef.current !== user.id) {
          // Si l'utilisateur a changé, charger d'abord son cache local dédié
          const userLocalState = loadPersistedState(user.id);
          setPersisted(userLocalState);
          persistedRef.current = userLocalState;
          loadedCloudUserIdRef.current = user.id;
          loadCloudProfile(user);
        } else if (event !== 'TOKEN_REFRESHED') {
          loadCloudProfile(user);
        }
      } else {
        loadedCloudUserIdRef.current = null;
        isCloudLoadedRef.current = false;
        profileExistsRef.current = false;
        cloudBaselineRef.current = null;
        hasDirtyChangesRef.current = false;
        setCurrentUsername(null);
        setCloudSyncStatus('idle');
        const anonState = loadPersistedState(null);
        setPersisted(anonState);
        persistedRef.current = anonState;
      }
    });

    return () => subscription.unsubscribe();
  }, [loadCloudProfile]);

  // Synchronisation en direct depuis Supabase (Realtime + retour sur l'onglet + polling léger)
  useEffect(() => {
    if (!currentUser) return;

    const pullRemoteUpdates = async () => {
      if (!isCloudLoadedRef.current || hasDirtyChangesRef.current || saveInFlightRef.current) {
        return;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,username,credits,inventory,drop_history,stats,storage_limit')
          .eq('id', currentUser.id)
          .single();

        if (!error && data) {
          applyRemoteCloudRow(data as CloudProfileRow);
        }
      } catch {
        // Ignore transient network errors during background poll
      }
    };

    const channel = supabase
      .channel(`profile-sync-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (
            payload.new &&
            isCloudLoadedRef.current &&
            !hasDirtyChangesRef.current &&
            !saveInFlightRef.current
          ) {
            applyRemoteCloudRow(payload.new as CloudProfileRow);
          }
        }
      )
      .subscribe();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void pullRemoteUpdates();
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pullRemoteUpdates();
      }
    }, 45000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      void supabase.removeChannel(channel);
    };
  }, [currentUser, applyRemoteCloudRow]);

  // Sauvegarde automatique vers le Cloud Supabase uniquement si les champs cloud ont changé
  useEffect(() => {
    if (!currentUser || !isCloudLoadedRef.current) return;
    if (!hasCloudSyncedDiff(persisted, cloudBaselineRef.current)) {
      hasDirtyChangesRef.current = false;
      return;
    }

    hasDirtyChangesRef.current = true;
    setCloudSyncStatus('saving');
    const timeout = setTimeout(() => {
      void saveToCloudNow(persisted);
    }, 500);

    return () => clearTimeout(timeout);
  }, [persisted, currentUser, saveToCloudNow]);

  const [tickerDrops, setTickerDrops] = useState<DropHistoryItem[]>(() =>
    Array.from({ length: 10 }, () => generateSimulatedDrop())
  );

  // Sync theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', persisted.themeId);
  }, [persisted.themeId]);

  // Keep sound engine synced
  useEffect(() => {
    soundEngine.setEnabled(persisted.soundEnabled);
  }, [persisted.soundEnabled]);

  // Persist changes
  useEffect(() => {
    savePersistedState(persisted, currentUser?.id);
  }, [persisted, currentUser]);

  // Periodic ambient simulated drop in live ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTickerDrops((prev) => [generateSimulatedDrop(), ...prev.slice(0, 17)]);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const handleTabChange = (tab: NavTab) => {
    soundEngine.playClick();
    setActiveTab(tab);
    if (tab === 'boutique') {
      setActiveCrate(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCrate = (crate: CrateDefinition) => {
    soundEngine.playClick();
    setActiveCrate(crate);
    setActiveTab('boutique');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTheme = useCallback(
    (themeId: ThemeId, themeName: string) => {
      soundEngine.playClick();
      setPersisted((prev) => ({ ...prev, themeId }));
      pushToast(`Palette appliquée : ${themeName}`);
    },
    [pushToast]
  );

  const handleSpendCredits = useCallback(
    (amount: number): boolean => {
      if (persisted.balance < amount) {
        return false;
      }
      setPersisted((prev) => {
        if (prev.balance < amount) return prev;
        return {
          ...prev,
          balance: prev.balance - amount,
          stats: {
            ...prev.stats,
            totalSpent: prev.stats.totalSpent + amount,
          },
        };
      });
      return true;
    },
    [persisted.balance]
  );

  const handleAddItemsToInventory = useCallback(
    (items: InventoryItem[], crateName: string) => {
      const dropEntries: DropHistoryItem[] = items.map((it) => ({
        id: randomId('pdrop'),
        playerName: 'VOUS',
        isPlayer: true,
        crateName,
        skinName: it.name,
        weaponName: it.weaponName,
        weaponClass: it.weaponClass,
        rarity: it.rarity,
        value: it.value,
        timestamp: it.obtainedAt,
        seedHash: generateSeedHash(),
      }));

      setTickerDrops((prev) => [...dropEntries, ...prev.slice(0, 17)]);

      setPersisted((prev) => {
        const nextRarityCounts = { ...prev.stats.rarityCounts };
        let bestVal = prev.stats.bestDropValue;
        let bestName = prev.stats.bestDropName;
        let wonSum = 0;

        for (const it of items) {
          nextRarityCounts[it.rarity] = (nextRarityCounts[it.rarity] ?? 0) + 1;
          wonSum += it.value;
          if (it.value > bestVal) {
            bestVal = it.value;
            bestName = `${it.weaponName} | ${it.name} (${RARITIES[it.rarity].label})`;
          }
        }

        const freeSlots = Math.max(0, prev.inventoryCapacity - prev.inventory.length);
        const acceptedItems = items.slice(0, freeSlots);

        return {
          ...prev,
          inventory: [...acceptedItems, ...prev.inventory],
          history: [...dropEntries, ...prev.history.slice(0, 60)],
          stats: {
            ...prev.stats,
            casesOpened: prev.stats.casesOpened + items.length,
            totalWonValue: prev.stats.totalWonValue + wonSum,
            bestDropValue: bestVal,
            bestDropName: bestName,
            rarityCounts: nextRarityCounts,
          },
        };
      });
    },
    []
  );

  const handleSellItemsFromReveal = useCallback(
    (itemsToSell: InventoryItem[], soldValue: number) => {
      const ids = new Set(itemsToSell.map((i) => i.instanceId));
      setPersisted((prev) => ({
        ...prev,
        balance: prev.balance + soldValue,
        inventory: prev.inventory.filter((i) => !ids.has(i.instanceId)),
      }));
      pushToast(`Vendu pour +${formatCredits(soldValue)}`);
    },
    [pushToast]
  );

  const handleSellInventoryItem = useCallback(
    (instanceId: string) => {
      const target = persisted.inventory.find((i) => i.instanceId === instanceId);
      if (!target || target.locked) return;
      soundEngine.playCash();
      setPersisted((prev) => ({
        ...prev,
        balance: prev.balance + target.value,
        inventory: prev.inventory.filter((i) => i.instanceId !== instanceId),
        ...clearRemovedEquips(prev, new Set([instanceId])),
      }));
      pushToast(`${target.weaponName} | ${target.name} vendu (+${formatCredits(target.value)})`);
    },
    [persisted.inventory, pushToast]
  );

  const handleSellBulk = useCallback(
    (rarityOnly?: RarityId) => {
      const toSell = persisted.inventory.filter(
        (i) => !i.locked && (!rarityOnly || i.rarity === rarityOnly)
      );
      if (toSell.length === 0) return;
      const sum = toSell.reduce((acc, i) => acc + i.value, 0);
      const sellIds = new Set(toSell.map((i) => i.instanceId));
      soundEngine.playCash();
      setPersisted((prev) => ({
        ...prev,
        balance: prev.balance + sum,
        inventory: prev.inventory.filter((i) => !sellIds.has(i.instanceId)),
        ...clearRemovedEquips(prev, sellIds),
      }));
      pushToast(`${toSell.length} skin(s) vendus (+${formatCredits(sum)})`);
    },
    [persisted.inventory, pushToast]
  );

  const handleToggleLock = useCallback((instanceId: string) => {
    soundEngine.playClick();
    setPersisted((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.instanceId === instanceId ? { ...i, locked: !i.locked } : i
      ),
    }));
  }, []);

  const handleSendToUpgrader = useCallback((instanceId: string) => {
    soundEngine.playClick();
    setUpgraderSeedId(instanceId);
    setActiveTab('upgrader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSendToContract = useCallback((instanceId: string) => {
    soundEngine.playClick();
    setContractSeedId(instanceId);
    setActiveTab('contrat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleCompleteContract = useCallback(
    (consumedInstanceIds: string[], wonItem: InventoryItem) => {
      const consumedSet = new Set(consumedInstanceIds);
      const dropEntry: DropHistoryItem = {
        id: randomId('ctdrop'),
        playerName: 'VOUS',
        isPlayer: true,
        crateName: `Contrat • ${wonItem.crateName}`,
        skinName: wonItem.name,
        weaponName: wonItem.weaponName,
        weaponClass: wonItem.weaponClass,
        rarity: wonItem.rarity,
        value: wonItem.value,
        timestamp: wonItem.obtainedAt,
        seedHash: generateSeedHash(),
      };
      setTickerDrops((prev) => [dropEntry, ...prev.slice(0, 17)]);

      setPersisted((prev) => ({
        ...prev,
        inventory: [
          wonItem,
          ...prev.inventory.filter((item) => !consumedSet.has(item.instanceId)),
        ],
        ...clearRemovedEquips(prev, consumedSet),
        history: [dropEntry, ...prev.history.slice(0, 60)],
        stats: {
          ...prev.stats,
          contractsCompleted: (prev.stats.contractsCompleted ?? 0) + 1,
          totalWonValue: prev.stats.totalWonValue + wonItem.value,
          bestDropValue: Math.max(prev.stats.bestDropValue, wonItem.value),
          bestDropName:
            wonItem.value > prev.stats.bestDropValue
              ? `${wonItem.weaponName} | ${wonItem.name} (${RARITIES[wonItem.rarity].label})`
              : prev.stats.bestDropName,
        },
      }));
      pushToast(
        `Contrat signé : ${wonItem.weaponName} | ${wonItem.name} (${RARITIES[wonItem.rarity].label}) !`
      );
    },
    [pushToast]
  );

  const handleConsumeUpgraderItem = useCallback((instanceId: string) => {
    setPersisted((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((i) => i.instanceId !== instanceId),
      ...clearRemovedEquips(prev, new Set([instanceId])),
    }));
  }, []);

  const handleWinUpgrade = useCallback(
    (newItem: InventoryItem) => {
      const dropEntry: DropHistoryItem = {
        id: randomId('updrop'),
        playerName: 'VOUS',
        isPlayer: true,
        crateName: `Upgrade • ${newItem.crateName}`,
        skinName: newItem.name,
        weaponName: newItem.weaponName,
        weaponClass: newItem.weaponClass,
        rarity: newItem.rarity,
        value: newItem.value,
        timestamp: newItem.obtainedAt,
        seedHash: generateSeedHash(),
      };
      setTickerDrops((prev) => [dropEntry, ...prev.slice(0, 17)]);

      setPersisted((prev) => ({
        ...prev,
        inventory: [newItem, ...prev.inventory],
        history: [dropEntry, ...prev.history.slice(0, 60)],
        stats: {
          ...prev.stats,
          totalWonValue: prev.stats.totalWonValue + newItem.value,
          bestDropValue: Math.max(prev.stats.bestDropValue, newItem.value),
          bestDropName:
            newItem.value > prev.stats.bestDropValue
              ? `${newItem.weaponName} | ${newItem.name} (${RARITIES[newItem.rarity].label})`
              : prev.stats.bestDropName,
        },
      }));
      pushToast(`Upgrade réussi : ${newItem.weaponName} | ${newItem.name} !`);
    },
    [pushToast]
  );

  const handleRecordUpgradeAttempt = useCallback((won: boolean) => {
    setPersisted((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        upgradesAttempted: prev.stats.upgradesAttempted + 1,
        upgradesWon: prev.stats.upgradesWon + (won ? 1 : 0),
      },
    }));
  }, []);

  const handleStartUpgrade = useCallback(
    (sourceInstanceId: string, won: boolean, wonItem: InventoryItem | null) => {
      setPersisted((prev) => {
        const exists = prev.inventory.some(
          (i) => i.instanceId === sourceInstanceId && !i.locked
        );
        if (!exists) return prev;
        return {
          ...prev,
          inventory: prev.inventory.filter((i) => i.instanceId !== sourceInstanceId),
          ...clearRemovedEquips(prev, new Set([sourceInstanceId])),
          pendingUpgrade: won && wonItem ? wonItem : null,
          stats: {
            ...prev.stats,
            upgradesAttempted: prev.stats.upgradesAttempted + 1,
            upgradesWon: prev.stats.upgradesWon + (won ? 1 : 0),
          },
        };
      });
    },
    []
  );

  const handleResolvePendingUpgrade = useCallback(() => {
    const reward = persisted.pendingUpgrade;
    if (!reward || resolvingUpgradeIdRef.current === reward.instanceId) return;
    resolvingUpgradeIdRef.current = reward.instanceId;

    const dropEntry: DropHistoryItem = {
      id: randomId('updrop'),
      playerName: 'VOUS',
      isPlayer: true,
      crateName: `Upgrade • ${reward.crateName}`,
      skinName: reward.name,
      weaponName: reward.weaponName,
      weaponClass: reward.weaponClass,
      rarity: reward.rarity,
      value: reward.value,
      timestamp: reward.obtainedAt,
      seedHash: generateSeedHash(),
    };
    setTickerDrops((prev) => [dropEntry, ...prev.slice(0, 17)]);

    setPersisted((prev) => {
      if (!prev.pendingUpgrade || prev.pendingUpgrade.instanceId !== reward.instanceId) {
        return prev;
      }
      const item = prev.pendingUpgrade;
      const alreadyInInv = prev.inventory.some((i) => i.instanceId === item.instanceId);
      return {
        ...prev,
        pendingUpgrade: null,
        inventory: alreadyInInv ? prev.inventory : [item, ...prev.inventory],
        history: [dropEntry, ...prev.history.slice(0, 60)],
        stats: {
          ...prev.stats,
          totalWonValue: prev.stats.totalWonValue + item.value,
          bestDropValue: Math.max(prev.stats.bestDropValue, item.value),
          bestDropName:
            item.value > prev.stats.bestDropValue
              ? `${item.weaponName} | ${item.name} (${RARITIES[item.rarity].label})`
              : prev.stats.bestDropName,
        },
      };
    });
    pushToast(`Upgrade réussi : ${reward.weaponName} | ${reward.name} !`);
  }, [persisted.pendingUpgrade, pushToast]);

  // Si l'utilisateur quitte l'onglet Upgrader ou recharge la page pendant l'animation d'un upgrade gagné,
  // on livre automatiquement le gain en attente sans jamais restaurer le skin déjà consommé.
  useEffect(() => {
    if (!persisted.pendingUpgrade) {
      resolvingUpgradeIdRef.current = null;
      return;
    }
    if (activeTab !== 'upgrader' || pageMode !== 'casino') {
      handleResolvePendingUpgrade();
    }
  }, [persisted.pendingUpgrade, activeTab, pageMode, handleResolvePendingUpgrade]);

  const handleEquipInventoryItem = useCallback(
    (instanceId: string) => {
      const target = persisted.inventory.find((i) => i.instanceId === instanceId);
      if (!target) return;
      soundEngine.playClick();
      if (target.weaponClass === 'lame') {
        const removing = persisted.equippedKnifeId === instanceId;
        setPersisted((prev) => ({
          ...prev,
          equippedKnifeId: prev.equippedKnifeId === instanceId ? null : instanceId,
          equippedWeaponId: prev.equippedWeaponId === instanceId ? null : prev.equippedWeaponId,
        }));
        pushToast(
          removing
            ? `Couteau retiré du slot 2 : ${target.weaponName} | ${target.name}`
            : `Couteau équipé (Touche 2) : ${target.weaponName} | ${target.name}`
        );
      } else {
        const removing = persisted.equippedWeaponId === instanceId;
        setPersisted((prev) => ({
          ...prev,
          equippedWeaponId: prev.equippedWeaponId === instanceId ? null : instanceId,
        }));
        pushToast(
          removing
            ? `Arme retirée du slot 1 : ${target.weaponName} | ${target.name}`
            : `Arme principale équipée (Touche 1) : ${target.weaponName} | ${target.name}`
        );
      }
    },
    [persisted.equippedKnifeId, persisted.equippedWeaponId, persisted.inventory, pushToast]
  );

  const handleUpgradeStorage = useCallback(() => {
    const cost = getNextStorageUpgradeCost(persisted.inventoryCapacity);
    if (persisted.balance < cost) {
      soundEngine.playFail();
      pushToast(`Crédits insuffisants (${formatCredits(cost)} requis)`);
      return;
    }

    const nextCap = persisted.inventoryCapacity + STORAGE_UPGRADE_STEP;
    soundEngine.playCash();
    setPersisted((prev) => {
      const prevCost = getNextStorageUpgradeCost(prev.inventoryCapacity);
      if (prev.balance < prevCost) return prev;
      return {
        ...prev,
        balance: prev.balance - prevCost,
        inventoryCapacity: prev.inventoryCapacity + STORAGE_UPGRADE_STEP,
        stats: {
          ...prev.stats,
          totalSpent: prev.stats.totalSpent + prevCost,
        },
      };
    });
    pushToast(`Stockage augmenté à ${nextCap} places (-${formatCredits(cost)})`);
  }, [persisted.balance, persisted.inventoryCapacity, pushToast]);

  const syncDailyDateRollover = useCallback(() => {
    setPersisted((prev) => {
      const rolled = ensureTodayChallenges(prev.dailyChallenges);
      if (rolled.date === prev.dailyChallenges.date) return prev;
      return {
        ...prev,
        dailyChallenges: rolled,
      };
    });
  }, []);

  const notifiedChallengeKeysRef = useRef<Set<string> | null>(null);
  if (notifiedChallengeKeysRef.current === null) {
    const initialSet = new Set<string>();
    const dc = ensureTodayChallenges(persisted.dailyChallenges);
    for (const c of dc.challenges) {
      if (c.completed) initialSet.add(`${dc.date}::${c.id}`);
    }
    if (dc.bonusClaimed) initialSet.add(`${dc.date}::bonus`);
    notifiedChallengeKeysRef.current = initialSet;
  }

  useEffect(() => {
    const notified = notifiedChallengeKeysRef.current!;
    const dc = persisted.dailyChallenges;
    let toastPlayed = false;

    for (const c of dc.challenges) {
      const key = `${dc.date}::${c.id}`;
      if (c.completed && !notified.has(key)) {
        notified.add(key);
        if (pageModeRef.current === 'casino') {
          const def = getChallengeDefinition(c.id);
          if (def) {
            pushToast(`Défi réussi : ${def.title} (+${formatCredits(def.reward)})`);
            toastPlayed = true;
          }
        }
      }
    }

    const bonusKey = `${dc.date}::bonus`;
    if (dc.bonusClaimed && !notified.has(bonusKey)) {
      notified.add(bonusKey);
      if (pageModeRef.current === 'casino') {
        pushToast(
          `${DAILY_CHALLENGES_LIMIT}/${DAILY_CHALLENGES_LIMIT} Défis complétés ! Bonus +${formatCredits(DAILY_BONUS_CREDITS)}`
        );
        soundEngine.playReveal('legendaire');
        toastPlayed = false;
      }
    }

    if (toastPlayed) {
      soundEngine.playCash();
    }
  }, [persisted.dailyChallenges, pushToast]);

  const handleZombieChallengeProgress = useCallback((event: ZombieChallengeEvent) => {
    const now = Date.now();
    setPersisted((prev) => {
      const result = applyZombieChallengeProgress(prev.dailyChallenges, event, now);
      if (!result.changed && result.creditsEarned === 0) return prev;
      return {
        ...prev,
        balance: prev.balance + result.creditsEarned,
        dailyChallenges: result.nextState,
      };
    });
  }, []);

  const handleExitZombieMode = useCallback(
    (bankedCredits: number, goToShop = false) => {
      if (bankedCredits > 0) {
        soundEngine.playCash();
        const now = Date.now();
        setPersisted((prev) => {
          const res = applyZombieChallengeProgress(
            prev.dailyChallenges,
            { extractedCreditsDelta: bankedCredits },
            now
          );
          return {
            ...prev,
            balance: prev.balance + bankedCredits + res.creditsEarned,
            dailyChallenges: res.nextState,
          };
        });
        pushToast(`Extraction Zombie réussie : +${formatCredits(bankedCredits)}`);
      }
      setPageMode('casino');
      if (goToShop) {
        setActiveTab('boutique');
        setActiveCrate(null);
      }
    },
    [pushToast]
  );

  const handleResetSession = useCallback(() => {
    soundEngine.playClick();
    setUpgraderSeedId(null);
    setContractSeedId(null);
    resolvingUpgradeIdRef.current = null;
    setTickerDrops(Array.from({ length: 10 }, () => generateSimulatedDrop()));
    setPersisted((prev) => ({
      ...createInitialState(),
      stats: createDefaultStats(),
      dailyChallenges: ensureTodayChallenges(prev.dailyChallenges),
      soundEnabled: prev.soundEnabled,
      themeId: prev.themeId,
    }));
    pushToast('Session réinitialisée à 3 000 CR');
  }, [pushToast]);

  const todayChallenges = ensureTodayChallenges(persisted.dailyChallenges);
  const completedChallengesCount = todayChallenges.challenges.filter((c) => c.completed).length;

  return (
    <WeaponInspectorProvider>
      {pageMode === 'zombie' ? (
        <ZombieGameView
          inventory={persisted.inventory}
          equippedWeaponId={persisted.equippedWeaponId}
          equippedKnifeId={persisted.equippedKnifeId}
          balance={persisted.balance}
          dailyChallenges={todayChallenges}
          onChallengeProgress={handleZombieChallengeProgress}
          onExit={(bankedCredits) => handleExitZombieMode(bankedCredits, false)}
          onGoToShop={(bankedCredits) => handleExitZombieMode(bankedCredits, true)}
        />
      ) : (
      <div className="relative min-h-screen bg-surface-base text-accent-50 transition-colors duration-300">
      {/* Ambient dynamic architectural background */}
      <div className="bg-vault-grid animate-vault-grid pointer-events-none fixed inset-0 opacity-70" />
      <div className="bg-vault-aura pointer-events-none fixed inset-x-0 top-0 h-[440px]" />
      <motion.div
        animate={{ x: [0, 35, 0], y: [0, -24, 0], opacity: [0.16, 0.28, 0.16] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none fixed -left-24 top-1/3 h-80 w-80 rounded-full bg-accent-500/15 blur-[110px]"
      />
      <motion.div
        animate={{ x: [0, -30, 0], y: [0, 26, 0], opacity: [0.14, 0.24, 0.14] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="pointer-events-none fixed -right-24 bottom-1/4 h-80 w-80 rounded-full bg-accent2-400/15 blur-[110px]"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          balance={persisted.balance}
          inventoryCount={persisted.inventory.length}
          inventoryCapacity={persisted.inventoryCapacity}
          soundEnabled={persisted.soundEnabled}
          onToggleSound={() =>
            setPersisted((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
          }
          onOpenZombie={() => {
            syncDailyDateRollover();
            setPageMode('zombie');
          }}
          onOpenChallenges={() => {
            syncDailyDateRollover();
            setChallengesModalOpen(true);
          }}
          challengesCompletedCount={completedChallengesCount}
          themeId={persisted.themeId}
          onSelectTheme={handleSelectTheme}
          onOpenAuth={() => setAuthModalOpen(true)}
          userEmail={currentUser?.email ?? null}
          username={currentUsername}
          cloudSyncStatus={cloudSyncStatus}
        />

        <LiveTicker drops={tickerDrops} />

        {/* Main Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'boutique' && activeCrate === null && (
              <motion.div
                key="boutique-home"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="space-y-10"
              >
                <HeroBanner
                  onExploreClick={() => {
                    document
                      .getElementById('categories-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  onOpenFeaturedCrate={() =>
                    handleSelectCrate(CRATES[CRATES.length - 1])
                  }
                />
                <CategorySection onSelectCrate={handleSelectCrate} />
              </motion.div>
            )}

            {activeTab === 'boutique' && activeCrate !== null && (
              <motion.div
                key={`crate-${activeCrate.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                <CaseOpeningView
                  crate={activeCrate}
                  balance={persisted.balance}
                  inventoryCount={persisted.inventory.length}
                  inventoryCapacity={persisted.inventoryCapacity}
                  onBack={() => {
                    soundEngine.playClick();
                    setActiveCrate(null);
                  }}
                  onSpendCredits={handleSpendCredits}
                  onAddItemsToInventory={handleAddItemsToInventory}
                  onSellItemsFromReveal={handleSellItemsFromReveal}
                />
              </motion.div>
            )}

            {activeTab === 'inventaire' && (
              <motion.div
                key="inventaire"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <InventoryView
                  items={persisted.inventory}
                  inventoryCapacity={persisted.inventoryCapacity}
                  balance={persisted.balance}
                  equippedWeaponId={persisted.equippedWeaponId}
                  equippedKnifeId={persisted.equippedKnifeId}
                  onEquipItem={handleEquipInventoryItem}
                  onSellItem={handleSellInventoryItem}
                  onSellBulk={handleSellBulk}
                  onToggleLock={handleToggleLock}
                  onSendToUpgrader={handleSendToUpgrader}
                  onSendToContract={handleSendToContract}
                  onUpgradeStorage={handleUpgradeStorage}
                  onGoToShop={() => handleTabChange('boutique')}
                />
              </motion.div>
            )}

            {activeTab === 'upgrader' && (
              <motion.div
                key="upgrader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <UpgraderView
                  inventory={persisted.inventory}
                  preselectedInstanceId={upgraderSeedId}
                  onConsumeItem={handleConsumeUpgraderItem}
                  onWinUpgrade={handleWinUpgrade}
                  onRecordAttempt={handleRecordUpgradeAttempt}
                  onStartUpgrade={handleStartUpgrade}
                  onResolvePendingUpgrade={handleResolvePendingUpgrade}
                  onGoToShop={() => handleTabChange('boutique')}
                />
              </motion.div>
            )}

            {activeTab === 'contrat' && (
              <motion.div
                key="contrat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ContractView
                  inventory={persisted.inventory}
                  equippedWeaponId={persisted.equippedWeaponId}
                  equippedKnifeId={persisted.equippedKnifeId}
                  preselectedInstanceId={contractSeedId}
                  onClearPreselected={() => setContractSeedId(null)}
                  onCompleteContract={handleCompleteContract}
                  onSellReward={(item) => handleSellItemsFromReveal([item], item.value)}
                  onGoToShop={() => handleTabChange('boutique')}
                />
              </motion.div>
            )}

            {activeTab === 'statistiques' && (
              <motion.div
                key="statistiques"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <StatsAndGuideView
                  stats={persisted.stats}
                  history={persisted.history}
                  onResetSession={handleResetSession}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Clean Footer */}
        <footer className="border-t border-accent-500/15 bg-surface-base/90 py-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-accent-200/55 sm:flex-row sm:px-6 sm:text-left">
            <div>
              <strong className="text-accent-300">Dopamine.gg</strong>{' '}
              <TypewriterText
                persistKey="footer-disclaimer"
                delayMs={180}
                speedMs={42}
                triggerOnView={true}
                text="— Site de simulation de casino entièrement fictif. Aucun argent réel, aucun pari réel."
              />
            </div>
            <div>
              <TypewriterText
                persistKey="footer-features"
                delayMs={300}
                speedMs={42}
                triggerOnView={true}
                text="Modèles 3D interactifs, Upgrader, Contrats d’échange & mode Zombie FPS."
              />
            </div>
          </div>
        </footer>
      </div>

      {/* Floating Toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="rounded-xl border border-accent-400/40 bg-surface-card/95 px-4 py-2.5 text-xs font-semibold text-accent-200 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Interactive 3D Weapon Inspection Modal */}
      <GlobalInspectorModal />

      {/* Auth / Cloud Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={currentUser}
        currentUsername={currentUsername}
        onAuthSuccess={() => {
          if (currentUser) loadCloudProfile(currentUser);
        }}
      />

      {/* Zombie Daily Challenges Modal */}
      <ChallengesModal
        isOpen={challengesModalOpen}
        dailyChallenges={todayChallenges}
        balance={persisted.balance}
        onClose={() => setChallengesModalOpen(false)}
        onPlayZombie={() => {
          setChallengesModalOpen(false);
          syncDailyDateRollover();
          setPageMode('zombie');
        }}
        onSyncDateRollover={syncDailyDateRollover}
      />
      </div>
      )}
    </WeaponInspectorProvider>
  );
}

export default App;
