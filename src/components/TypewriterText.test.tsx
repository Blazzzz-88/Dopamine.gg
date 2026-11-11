// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { resetTypewriterHistory, TypewriterText } from './TypewriterText';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('TypewriterText — écriture progressive des explications', () => {
  beforeEach(() => {
    resetTypewriterHistory();
  });

  it('écrit le texte progressivement côté client avec segments riches puis termine sans curseur', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <TypewriterText
            persistKey="test-1"
            delayMs={10}
            speedMs={10}
            triggerOnView={false}
            segments={[
              { text: 'Bonjour ' },
              { text: 'Dopamine', strong: true },
            ]}
          />
        </StrictMode>
      );
    });

    const el = container.querySelector('span[data-typing]') as HTMLElement | null;
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-typing')).toBe('typing');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 95));
    });
    expect(el?.textContent?.length ?? 0).toBeGreaterThan(2);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 240));
    });
    expect(el?.getAttribute('data-typing')).toBe('done');
    expect(el?.textContent).toBe('Bonjour Dopamine');
    expect(el?.querySelector('strong')?.textContent).toBe('Dopamine');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('ne recommence jamais un texte déjà écrit lors des réaffichages ou re-rendus parents', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // 1er affichage : écriture jusqu'à complétion
    await act(async () => {
      root.render(
        <TypewriterText
          persistKey="test-persist"
          delayMs={5}
          speedMs={8}
          triggerOnView={false}
          segments={[{ text: 'Explication complète' }]}
        />
      );
    });

    const el = container.querySelector('span[data-typing]') as HTMLElement;
    await act(async () => {
      el.click();
    });
    expect(el.getAttribute('data-typing')).toBe('done');
    expect(el.textContent).toBe('Explication complète');

    // Simule changement d'onglet (démontage puis ré-affichage avec nouveau tableau inline)
    await act(async () => {
      root.unmount();
    });

    const root2 = createRoot(container);
    await act(async () => {
      root2.render(
        <TypewriterText
          persistKey="test-persist"
          delayMs={5}
          speedMs={40}
          triggerOnView={false}
          segments={[{ text: 'Explication complète' }]}
        />
      );
    });

    const el2 = container.querySelector('span[data-typing]') as HTMLElement;
    expect(el2.getAttribute('data-typing')).toBe('done');
    expect(el2.textContent).toBe('Explication complète');

    await act(async () => {
      root2.unmount();
    });
    container.remove();
  });

  it('permet de révéler instantanément tout le texte au clic', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TypewriterText
          persistKey="test-click"
          delayMs={500}
          speedMs={40}
          triggerOnView={false}
          text="Texte long explicatif."
        />
      );
    });

    const el = container.querySelector('span[data-typing]') as HTMLElement;
    expect(el.getAttribute('data-typing')).toBe('typing');

    await act(async () => {
      el.click();
    });

    expect(el.getAttribute('data-typing')).toBe('done');
    expect(el.textContent).toBe('Texte long explicatif.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
