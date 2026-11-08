/**
 * Detail panel host (PRODUCT_SPEC §2 as re-cut by Shape Brief §2.2): an overlay inspector by
 * default so the roster keeps its layout (opening does not reflow columns), docked by explicit pin
 * or on ≥1600px canvases where both can afford the split.
 *
 * The panel is route-driven (`ref` in the hash), so opening an entity is linkable and browser
 * back closes it; Escape closes the floating inspector. The pin preference is per-device
 * localStorage (a view preference, not query semantics — it never enters the URL).
 */
import { useCallback, useEffect, useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { EntityRef, LexQuery } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import { useMediaQuery } from '../shell/useMediaQuery.ts';
import { RefDetail } from './RefDetail.tsx';

const PIN_STORAGE_KEY = 'lw.explore.detailPin';

function readPin(): boolean {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface DetailHostProps {
  client: EngineClient;
  entityRef: EntityRef | undefined;
  onClose: () => void;
  onOpenRef: (ref: EntityRef) => void;
  onOpenInExplore: (query: LexQuery) => void;
}

export function DetailHost({ client, entityRef, onClose, onOpenRef, onOpenInExplore }: DetailHostProps) {
  const tablet = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1600px)');
  const [pinned, setPinned] = useState<boolean>(readPin);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Private storage: the pin then lives for this session only.
      }
      return next;
    });
  }, []);

  // Escape closes the floating inspector (the docked split closes through the × button / route).
  useEffect(() => {
    if (!entityRef || tablet === false || pinned) return;
    if (wide) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [entityRef, tablet, pinned, wide, onClose]);

  if (!entityRef) return null;

  const pinButton = (
    <button
      type="button"
      onClick={togglePin}
      aria-pressed={pinned}
      title={pinned ? '改回浮层（不挤压列表时不受遮挡影响的快捷查看）' : '泊靠为右栏（连续对照，列表列宽重排）'}
      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
    >
      {pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
      <span className="sr-only">{pinned ? '改回浮层详情' : '泊靠详情面板'}</span>
    </button>
  );

  // Mobile: full-screen sheet with an explicit back affordance.
  if (!tablet) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg-surface)]">
        <RefDetail
          client={client}
          entityRef={entityRef}
          onClose={onClose}
          onOpenRef={onOpenRef}
          onOpenInExplore={onOpenInExplore}
        />
      </div>
    );
  }

  const body = (
    <RefDetail
      client={client}
      entityRef={entityRef}
      onClose={onClose}
      onOpenRef={onOpenRef}
      onOpenInExplore={onOpenInExplore}
      extraHeaderAction={pinButton}
    />
  );

  if (pinned || wide) {
    return (
      <aside
        className="hidden w-[440px] min-w-[380px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] md:block"
        aria-label="详情面板（泊靠）"
      >
        {body}
      </aside>
    );
  }

  return (
    <aside
      className="absolute bottom-0 right-0 top-0 z-30 w-[min(440px,45vw)] border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[-10px_0_28px_rgba(15,20,30,0.10)]"
      aria-label="详情面板（浮层）"
    >
      {body}
    </aside>
  );
}
