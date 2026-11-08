/**
 * Route-driven detail host.
 *
 * ≥1280 px: a docked inspector by default (continuous comparison); it can be unpinned to float.
 * 768–1279 px: a floating inspector so the roster keeps its full width.
 * <768 px: a full-screen sheet.
 */
import { useCallback, useEffect, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { kindOf, type EntityRef, type LexQuery } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import { useMediaQuery } from '../shell/useMediaQuery.ts';
import { EntityPage } from './EntityPage.tsx';
import { FamilyPage } from './FamilyPage.tsx';
import { FormPage } from './FormPage.tsx';

const PIN_KEY = 'lw.observatory.detailDocked';

function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PIN_KEY) !== '0';
  } catch {
    return true;
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
  const wide = useMediaQuery('(min-width: 1536px)');
  const [pinned, setPinned] = useState<boolean>(readPinned);

  const togglePin = useCallback(() => {
    setPinned((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        // Private storage: the preference lives for this session.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!entityRef || (tablet && wide && pinned)) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [entityRef, tablet, wide, pinned, onClose]);

  if (!entityRef) return null;

  let kind: ReturnType<typeof kindOf> | null = null;
  try {
    kind = kindOf(entityRef);
  } catch {
    return null;
  }

  const pinButton = wide ? (
    <button
      type="button"
      onClick={togglePin}
      className="btn btn-ghost px-1 py-1"
      aria-pressed={pinned}
      title={pinned ? '取消泊靠，改为浮层' : '泊靠为右栏'}
    >
      {pinned ? <PanelRightClose size={14} aria-hidden /> : <PanelRightOpen size={14} aria-hidden />}
      <span className="sr-only">{pinned ? '改为浮层' : '泊靠为右栏'}</span>
    </button>
  ) : undefined;

  const body =
    kind === 'form' ? (
      <FormPage client={client} entityRef={entityRef} onClose={onClose} onOpenRef={onOpenRef} onOpenInExplore={onOpenInExplore} extraHeaderAction={pinButton} />
    ) : kind === 'bnc_family' ? (
      <FamilyPage client={client} entityRef={entityRef} onClose={onClose} onOpenRef={onOpenRef} onOpenInExplore={onOpenInExplore} extraHeaderAction={pinButton} />
    ) : (
      <EntityPage client={client} entityRef={entityRef} onClose={onClose} onOpenRef={onOpenRef} onOpenInExplore={onOpenInExplore} extraHeaderAction={pinButton} />
    );

  if (!tablet) {
    return <div className="sheet-in fixed inset-0 z-50 flex flex-col bg-[var(--bg-surface)]">{body}</div>;
  }

  if (wide && pinned) {
    return (
      <aside className="hidden w-[400px] shrink-0 border-l border-[var(--border-strong)] bg-[var(--bg-surface)] 2xl:flex 2xl:flex-col" aria-label="详情面板（泊靠）">
        {body}
      </aside>
    );
  }

  return (
    <aside
      className="sheet-in absolute inset-y-0 right-0 z-30 flex w-[min(440px,52vw)] flex-col border-l border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[-16px_0_40px_rgba(16,22,19,0.16)]"
      aria-label="详情面板（浮层）"
    >
      {body}
    </aside>
  );
}
