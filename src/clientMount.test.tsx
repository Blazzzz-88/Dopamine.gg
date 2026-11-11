// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from './App';
import { CRATES } from './data/catalog';
import { createInventoryItem } from './utils/rng';
import {
  BASE_INVENTORY_CAPACITY,
  createInitialState,
  getNextStorageUpgradeCost,
  loadPersistedState,
  savePersistedState,
} from './utils/storage';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('Client mount smoke test (jsdom + StrictMode)', () => {
  it('mounts StrictMode App into DOM, applies default saphir theme, and allows switching theme', async () => {
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
      origError(...args);
    };

    const onWindowError = (e: ErrorEvent) => errors.push(e.error || e.message);
    window.addEventListener('error', onWindowError);

    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(document.documentElement.getAttribute('data-theme')).toBe('saphir');
    expect(container.innerHTML).toContain('Dopamine');
    expect(container.innerHTML).toContain('Opérations Tactiques');
    expect(container.innerHTML).toContain('Ombre Boréale');
    expect(container.innerHTML).toContain('100% Sécurisé');
    expect(container.innerHTML).not.toContain('Solde fictif');
    expect(container.querySelector('button[title*="Recharger"]')).toBeNull();

    const ambreBtn = container.querySelector('button[aria-label="Thème Obsidienne & Or"]') as HTMLButtonElement | null;
    expect(ambreBtn).not.toBeNull();
    await act(async () => {
      ambreBtn?.click();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('ambre');
    expect(errors).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });

    window.removeEventListener('error', onWindowError);
    console.error = origError;
  });

  it('ouvre la modale d’inspection 3D au clic sur une photo d’arme et la referme proprement', async () => {
    const errors: unknown[] = [];
    const onWindowError = (e: ErrorEvent) => errors.push(e.error || e.message);
    window.addEventListener('error', onWindowError);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    });
    await new Promise((r) => setTimeout(r, 80));

    const inspectBtn = container.querySelector('button[aria-label^="Inspecter "]') as HTMLButtonElement | null;
    expect(inspectBtn).not.toBeNull();

    await act(async () => {
      inspectBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 80));

    const dialog = document.querySelector('[role="dialog"][aria-label^="Inspection 3D"]');
    expect(dialog).not.toBeNull();

    const closeBtn = document.querySelector('button[aria-label="Fermer l’inspection 3D"]') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 120));

    expect(document.querySelector('[role="dialog"][aria-label^="Inspection 3D"]')).toBeNull();
    expect(errors).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    window.removeEventListener('error', onWindowError);
  });

  it('réinitialise le solde à 3 000 CR, l’inventaire (sans couteaux offerts) et l’historique lors de la purge des anciennes sessions', () => {
    localStorage.clear();
    localStorage.setItem(
      'dopamine_gg_state_v2',
      JSON.stringify({
        balance: 85000,
        inventory: [{ instanceId: 'starter_knife_karambit_fade', name: 'Dégradé Impérial' }],
        history: [{ id: 'hist-v2', skinName: 'TestV2' }],
        stats: { casesOpened: 5 },
      })
    );
    localStorage.setItem(
      'dopamine_gg_state_v1',
      JSON.stringify({
        balance: 50000,
        inventory: [{ instanceId: 'old-v1', name: 'TestV1' }],
        history: [{ id: 'hist-v1', skinName: 'TestV1' }],
        stats: { casesOpened: 10 },
      })
    );
    localStorage.setItem(
      'aura_vault_state_v3',
      JSON.stringify({
        balance: 50000,
        inventory: [{ instanceId: 'old-v3', name: 'TestV3' }],
        history: [{ id: 'hist-v3', skinName: 'TestV3' }],
        stats: { casesOpened: 10 },
      })
    );
    localStorage.setItem(
      'aura_vault_state_v2',
      JSON.stringify({
        balance: 999999,
        inventory: [{ instanceId: 'old-1', name: 'Test' }],
        history: [{ id: 'hist-1', skinName: 'Test' }],
        stats: { casesOpened: 42, totalSpent: 15000, totalWonValue: 20000, bestDropValue: 9000 },
        themeId: 'ambre',
        soundEnabled: false,
      })
    );

    const state = loadPersistedState();
    expect(state.balance).toBe(3000);
    expect(state.inventory).toEqual([]);
    expect(state.equippedWeaponId).toBeNull();
    expect(state.history).toHaveLength(0);
    expect(state.stats.casesOpened).toBe(0);
    expect(state.stats.totalSpent).toBe(0);
    expect(localStorage.getItem('dopamine_gg_state_v2')).toBeNull();
    expect(localStorage.getItem('dopamine_gg_state_v1')).toBeNull();
    expect(localStorage.getItem('aura_vault_state_v3')).toBeNull();
    expect(localStorage.getItem('aura_vault_state_v2')).toBeNull();
    expect(state.themeId).toBe('ambre');
    expect(state.soundEnabled).toBe(false);
  });

  it('permet d’équiper une arme depuis Inventaire, la charge dans le FPS et retourne au casino avec Échap', async () => {
    localStorage.clear();
    const knifeSkin = CRATES[0].skins.find((s) => s.weaponClass === 'lame')!;
    const rifleSkin = CRATES[0].skins.find((s) => s.weaponClass === 'fusil')!;
    const knifeItem = { ...createInventoryItem(CRATES[0], knifeSkin, 'ouverture'), obtainedAt: 1000 };
    const rifleItem = { ...createInventoryItem(CRATES[0], rifleSkin, 'ouverture'), obtainedAt: 2000 };
    savePersistedState({
      ...createInitialState(),
      inventory: [rifleItem, knifeItem],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    });
    await new Promise((r) => setTimeout(r, 80));

    // Naviguer dans Inventaire et cliquer sur Équiper pour le couteau (2e carte)
    const invTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inventaire')
    );
    expect(invTabBtn).toBeDefined();
    await act(async () => {
      invTabBtn?.click();
    });
    for (let t = 0; t < 20; t++) {
      if (container.innerHTML.includes('Mon Inventaire')) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
    }

    const equipBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Équiper'
    );
    expect(equipBtns.length).toBe(2);
    // Équiper l'arme principale (1re carte) ET le couteau (2e carte) simultanément
    await act(async () => {
      equipBtns[0].click();
      equipBtns[1].click();
    });
    await new Promise((r) => setTimeout(r, 60));

    expect(container.innerHTML).toContain('Équipée (Slot 1 • Arme)');
    expect(container.innerHTML).toContain('Équipé (Slot 2 • Couteau)');
    expect(loadPersistedState().equippedWeaponId).toBe(rifleItem.instanceId);
    expect(loadPersistedState().equippedKnifeId).toBe(knifeItem.instanceId);

    // Ouvrir + -> Zombie et vérifier le démarrage sur Slot 1 puis bascule 2 (Couteau) -> 1 (Arme)
    const plusBtn = container.querySelector('button[aria-label="Gagner des crédits"]') as HTMLButtonElement | null;
    expect(plusBtn).not.toBeNull();
    await act(async () => {
      plusBtn?.click();
    });

    const zombieBtn = container.querySelector('button[role="menuitem"]') as HTMLButtonElement | null;
    expect(zombieBtn).not.toBeNull();
    expect(zombieBtn?.textContent).toContain('Zombie');

    await act(async () => {
      zombieBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 80));

    expect(container.innerHTML).toContain('Mode Zombie FPS');
    expect(container.innerHTML).toContain(`${rifleItem.weaponName} | ${rifleItem.name}`);
    expect(container.innerHTML).not.toContain('Équiper une arme (');

    // Touche 2 -> passe sur le couteau
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'é', code: 'Digit2', bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(container.innerHTML).toContain(`${knifeItem.weaponName} | ${knifeItem.name}`);

    // Touche 1 -> repasse sur l'arme principale
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '&', code: 'Digit1', bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(container.innerHTML).toContain(`${rifleItem.weaponName} | ${rifleItem.name}`);

    // Appuyer sur Échap doit retourner immédiatement au casino
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 80));

    expect(container.innerHTML).toContain('Mon Inventaire');
    expect(container.innerHTML).not.toContain('Mode Zombie FPS');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('limite l’inventaire à 25 armes par défaut et permet de l’augmenter (+5) pour 3000 CR, puis 3500 CR, etc.', async () => {
    expect(BASE_INVENTORY_CAPACITY).toBe(25);
    expect(getNextStorageUpgradeCost(25)).toBe(3000);
    expect(getNextStorageUpgradeCost(30)).toBe(3500);
    expect(getNextStorageUpgradeCost(35)).toBe(4000);

    localStorage.clear();
    const skin = CRATES[0].skins[0];
    const fullItems = Array.from({ length: 25 }, (_, idx) => ({
      ...createInventoryItem(CRATES[0], skin, 'ouverture'),
      instanceId: `inv_${idx}`,
      obtainedAt: 1000 + idx,
    }));
    savePersistedState({
      ...createInitialState(),
      balance: 7000,
      inventory: fullItems,
      inventoryCapacity: 25,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    });
    await new Promise((r) => setTimeout(r, 80));

    // Ouvrir une caisse quand l'inventaire est plein (25/25) doit bloquer l'achat
    const crateCard = Array.from(container.querySelectorAll('article')).find((el) =>
      el.textContent?.includes('Ombre Boréale')
    ) as HTMLElement | undefined;
    expect(crateCard).toBeDefined();
    await act(async () => {
      crateCard?.click();
    });
    for (let t = 0; t < 20; t++) {
      if (container.innerHTML.includes('Acheter &amp; Ouvrir') || container.innerHTML.includes('Acheter & Ouvrir')) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
    }
    expect(container.innerHTML).toContain('Inventaire plein (25/25)');
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Acheter & Ouvrir')
    ) as HTMLButtonElement | undefined;
    expect(openBtn?.disabled).toBe(true);

    // Aller dans Inventaire et cliquer sur le bouton Augmenter (+5 pour 3000 puis +5 pour 3500)
    const invTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inventaire')
    );
    await act(async () => {
      invTabBtn?.click();
    });
    for (let t = 0; t < 20; t++) {
      if (container.innerHTML.includes('Mon Inventaire')) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
    }

    const findAugmenterBtn = () =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Augmenter')
      ) as HTMLButtonElement | undefined;

    expect(container.querySelector('[data-testid="inventory-storage-count"]')?.textContent).toBe('25 / 25');
    const btn1 = findAugmenterBtn();
    expect(btn1).toBeDefined();
    expect(btn1?.disabled).toBe(false);
    expect(btn1?.textContent?.replace(/\s+/g, ' ')).toContain('3 000');

    // 1re amélioration : 25 -> 30 pour 3000 CR (reste 4000 CR)
    await act(async () => {
      btn1?.click();
    });
    await new Promise((r) => setTimeout(r, 60));

    let persisted = loadPersistedState();
    expect(persisted.inventoryCapacity).toBe(30);
    expect(persisted.balance).toBe(4000);
    expect(container.querySelector('[data-testid="inventory-storage-count"]')?.textContent).toBe('25 / 30');

    const btn2 = findAugmenterBtn();
    expect(btn2?.disabled).toBe(false);
    expect(btn2?.textContent?.replace(/\s+/g, ' ')).toContain('3 500');

    // 2e amélioration : 30 -> 35 pour 3500 CR (reste 500 CR, insuffisant pour 4000 CR)
    await act(async () => {
      btn2?.click();
    });
    await new Promise((r) => setTimeout(r, 60));

    persisted = loadPersistedState();
    expect(persisted.inventoryCapacity).toBe(35);
    expect(persisted.balance).toBe(500);
    expect(container.querySelector('[data-testid="inventory-storage-count"]')?.textContent).toBe('25 / 35');

    const btn3 = findAugmenterBtn();
    expect(btn3?.textContent?.replace(/\s+/g, ' ')).toContain('4 000');
    expect(btn3?.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
