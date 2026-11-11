import React, { useCallback, useEffect, useMemo, useRef } from 'react';

export interface TypewriterSegment {
  text: string;
  strong?: boolean;
  italic?: boolean;
  className?: string;
}

interface TypewriterTextProps {
  text?: string;
  segments?: TypewriterSegment[];
  /** Identifiant stable optionnel ; par défaut déduit du texte lui-même */
  persistKey?: string;
  /** Si vrai (par défaut), le texte déjà écrit une fois ne se réécrit plus lors des réaffichages */
  once?: boolean;
  /** Délai initial avant le début de la frappe (ms) */
  delayMs?: number;
  /** Intervalle moyen par caractère (ms) */
  speedMs?: number;
  /** Déclencher uniquement lorsque l'élément devient visible à l'écran */
  triggerOnView?: boolean;
  /** Masquer le curseur une fois la frappe terminée */
  hideCursorOnDone?: boolean;
  className?: string;
}

/** Mémorise en session tous les textes déjà écrits afin qu'ils ne recommencent jamais */
const completedTextCache = new Set<string>();

/** Utilitaire dédié aux tests unitaires pour isoler l'état initial si nécessaire. */
export function resetTypewriterHistory(): void {
  completedTextCache.clear();
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  segments,
  persistKey,
  once = true,
  delayMs = 150,
  speedMs = 42,
  triggerOnView = true,
  hideCursorOnDone = true,
  className = '',
}) => {
  const normalizedSegments = useMemo<TypewriterSegment[]>(
    () => segments ?? (text ? [{ text }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, segments?.map((s) => `${s.text}|${s.strong ? 1 : 0}|${s.italic ? 1 : 0}|${s.className ?? ''}`).join('\u0002')]
  );

  const contentSignature = useMemo(
    () => normalizedSegments.map((s) => s.text).join('\u0001'),
    [normalizedSegments]
  );

  const memoryKey = persistKey ?? contentSignature;

  const charTimestamps = useMemo(() => {
    const times: number[] = [];
    let t = delayMs;
    for (const seg of normalizedSegments) {
      for (let i = 0; i < seg.text.length; i++) {
        times.push(t);
        const ch = seg.text[i];
        const extra =
          ch === '.' || ch === '!' || ch === '?'
            ? speedMs * 4.5
            : ch === ',' || ch === ';' || ch === ':'
            ? speedMs * 2.4
            : 0;
        t += speedMs + extra;
      }
    }
    return times;
  }, [delayMs, normalizedSegments, speedMs]);

  const totalChars = charTimestamps.length;
  const isSSR = typeof window === 'undefined';
  const alreadyCompleted = isSSR || totalChars === 0 || (once && completedTextCache.has(memoryKey));

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const segRefs = useRef<Array<HTMLElement | null>>([]);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const completedRef = useRef(alreadyCompleted);

  const latestPropsRef = useRef({
    normalizedSegments,
    charTimestamps,
    totalChars,
    memoryKey,
    once,
    speedMs,
    hideCursorOnDone,
  });
  latestPropsRef.current = {
    normalizedSegments,
    charTimestamps,
    totalChars,
    memoryKey,
    once,
    speedMs,
    hideCursorOnDone,
  };

  const applyCharCount = useCallback((count: number) => {
    const {
      normalizedSegments: segs,
      totalChars: tot,
      memoryKey: mKey,
      once: remember,
      hideCursorOnDone: hideCursor,
    } = latestPropsRef.current;

    let budget = count;
    for (let idx = 0; idx < segs.length; idx++) {
      const el = segRefs.current[idx];
      if (!el) continue;
      const full = segs[idx].text;
      const sliceLen = Math.max(0, Math.min(full.length, budget));
      budget -= sliceLen;
      const nextSlice = full.slice(0, sliceLen);
      if (el.textContent !== nextSlice) {
        el.textContent = nextSlice;
      }
    }

    const isDone = count >= tot;
    completedRef.current = isDone;
    if (isDone && remember && tot > 0) {
      completedTextCache.add(mKey);
    }

    const root = containerRef.current;
    if (root) {
      root.setAttribute('data-typing', isDone ? 'done' : 'typing');
      if (isDone) {
        root.classList.remove('cursor-pointer');
        root.removeAttribute('title');
      } else {
        root.classList.add('cursor-pointer');
        root.setAttribute('title', 'Cliquer pour afficher tout le texte immédiatement');
      }
    }
    const cursor = cursorRef.current;
    if (cursor && hideCursor) {
      cursor.style.opacity = isDone ? '0' : '1';
    }
  }, []);

  const completeImmediately = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    applyCharCount(latestPropsRef.current.totalChars);
  }, [applyCharCount]);

  useEffect(() => {
    if (isSSR) return;

    // Si déjà écrit une fois (ou vide), on affiche tout d'emblée sans jamais relancer l'animation
    if (totalChars === 0 || (once && completedTextCache.has(memoryKey))) {
      applyCharCount(totalChars);
      return;
    }

    applyCharCount(0);

    let observer: IntersectionObserver | null = null;
    const startTyping = () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      const startMs = Date.now();
      const { speedMs: curSpeed, totalChars: curTotal, charTimestamps: times } = latestPropsRef.current;
      const tickStep = Math.max(16, Math.min(28, Math.floor(curSpeed * 0.75)));
      let current = 0;

      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startMs;
        let nextCount = current;
        while (nextCount < curTotal && times[nextCount] <= elapsed) {
          nextCount++;
        }
        if (nextCount > current) {
          current = nextCount;
          applyCharCount(nextCount);
        }
        if (nextCount >= curTotal && timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, tickStep);
    };

    const node = containerRef.current;
    if (!triggerOnView || !node || typeof IntersectionObserver === 'undefined') {
      startTyping();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            observer = null;
            startTyping();
          }
        },
        { threshold: 0.15 }
      );
      observer.observe(node);
    }

    return () => {
      observer?.disconnect();
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [applyCharCount, contentSignature, isSSR, memoryKey, once, totalChars, triggerOnView]);

  return (
    <span
      ref={containerRef}
      data-typing={alreadyCompleted ? 'done' : 'typing'}
      onClick={() => {
        if (!completedRef.current) completeImmediately();
      }}
      className={`inline ${!alreadyCompleted ? 'cursor-pointer' : ''} ${className}`}
      title={!alreadyCompleted ? 'Cliquer pour afficher tout le texte immédiatement' : undefined}
    >
      {normalizedSegments.map((seg, idx) => {
        const assignRef = (node: HTMLElement | null) => {
          segRefs.current[idx] = node;
        };
        const content = alreadyCompleted ? seg.text : '';
        if (seg.strong) {
          return (
            <strong key={idx} ref={assignRef} className={seg.className}>
              {content}
            </strong>
          );
        }
        if (seg.italic) {
          return (
            <em key={idx} ref={assignRef} className={seg.className}>
              {content}
            </em>
          );
        }
        return (
          <span key={idx} ref={assignRef} className={seg.className}>
            {content}
          </span>
        );
      })}
      <span
        ref={cursorRef}
        aria-hidden="true"
        style={{ opacity: alreadyCompleted && hideCursorOnDone ? 0 : 1 }}
        className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.14em] animate-pulse rounded-full bg-accent-400 shadow-[0_0_8px_var(--accent-400)] transition-opacity duration-300"
      />
    </span>
  );
};
