import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';
import { CaseOpeningView } from './components/CaseOpeningView';
import { InventoryView } from './components/InventoryView';
import { UpgraderView } from './components/UpgraderView';
import { ContractView } from './components/ContractView';
import { StatsAndGuideView } from './components/StatsAndGuideView';
import { CRATES } from './data/catalog';
import { createInventoryItem } from './utils/rng';
import { DEFAULT_STATS } from './utils/storage';

describe('Rendu des composants principaux (SSR smoke test)', () => {
  it('rend App avec le titre, les 3 catégories et les 6 caisses thématiques', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Dopamine');
    expect(html).toContain('Opérations Tactiques');
    expect(html).toContain('Avant-Garde Cyber');
    expect(html).toContain('Panthéon &amp; Reliques');
    expect(html).toContain('Ombre Boréale');
    expect(html).toContain('Protocole Cobalt');
    expect(html).toContain('Matrice Saphir');
    expect(html).toContain('Réacteur Plasma');
    expect(html).toContain('Empire d’Or');
    expect(html).toContain('Abysse Prismatique');
  });

  it('rend CaseOpeningView avec les 22 skins de la caisse sélectionnée', () => {
    const crate = CRATES[0];
    const html = renderToStaticMarkup(
      <CaseOpeningView
        crate={crate}
        balance={3000}
        onBack={() => {}}
        onSpendCredits={() => true}
        onAddItemsToInventory={() => {}}
        onSellItemsFromReveal={() => {}}
      />
    );
    expect(html).toContain(crate.name);
    expect(html).toContain('22 skins');
    expect(html).toContain('Secret');
  });

  it('rend InventoryView, UpgraderView et StatsAndGuideView sans erreur', () => {
    const sampleItem = createInventoryItem(CRATES[0], CRATES[0].skins[0], 'ouverture');
    const invHtml = renderToStaticMarkup(
      <InventoryView
        items={[sampleItem]}
        equippedWeaponId={null}
        onEquipItem={() => {}}
        onSellItem={() => {}}
        onSellBulk={() => {}}
        onToggleLock={() => {}}
        onSendToUpgrader={() => {}}
        onGoToShop={() => {}}
      />
    );
    expect(invHtml).toContain(sampleItem.name);
    expect(invHtml).toContain('Équiper');

    const upgHtml = renderToStaticMarkup(
      <UpgraderView
        inventory={[sampleItem]}
        preselectedInstanceId={sampleItem.instanceId}
        onConsumeItem={() => {}}
        onWinUpgrade={() => {}}
        onRecordAttempt={() => {}}
        onGoToShop={() => {}}
      />
    );
    expect(upgHtml).toContain('Upgrader Orbital');

    const contractHtml = renderToStaticMarkup(
      <ContractView
        inventory={[sampleItem]}
        onCompleteContract={() => {}}
        onSellReward={() => {}}
        onGoToShop={() => {}}
      />
    );
    expect(contractHtml).toContain('Contrat d’Échange');
    expect(contractHtml).toContain('Emplacements du contrat');
    expect(contractHtml).toContain('Sélectionnez encore 5 skins');

    const statsHtml = renderToStaticMarkup(
      <StatsAndGuideView
        stats={DEFAULT_STATS}
        history={[]}
        onResetSession={() => {}}
      />
    );
    expect(statsHtml).toContain('0.025%');
    expect(statsHtml).toContain('1.00%');
    expect(statsHtml).toContain('Comment fonctionne le casino Dopamine.gg');
  });
});
