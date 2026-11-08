/**
 * Detail panel host (PRODUCT_SPEC §2): right-side panel on desktop, full-screen sheet on mobile.
 *
 * The panel is route-driven (`ref` in the hash), so opening an entity is linkable and browser
 * back closes it.
 */
import type { EntityRef, LexQuery } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import { RefDetail } from './RefDetail.tsx';

export interface DetailHostProps {
  client: EngineClient;
  entityRef: EntityRef | undefined;
  onClose: () => void;
  onOpenRef: (ref: EntityRef) => void;
  onOpenInExplore: (query: LexQuery) => void;
}

export function DetailHost({ client, entityRef, onClose, onOpenRef, onOpenInExplore }: DetailHostProps) {
  if (!entityRef) return null;

  return (
    <>
      {/* Desktop: resizable-by-layout panel (fixed 420 px within the 380–560 px range). */}
      <aside className="hidden w-[420px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:block" aria-label="详情面板">
        <RefDetail client={client} entityRef={entityRef} onClose={onClose} onOpenRef={onOpenRef} onOpenInExplore={onOpenInExplore} />
      </aside>

      {/* Mobile: full-screen sheet with an explicit back affordance. */}
      <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg-surface)] lg:hidden">
        <RefDetail client={client} entityRef={entityRef} onClose={onClose} onOpenRef={onOpenRef} onOpenInExplore={onOpenInExplore} />
      </div>
    </>
  );
}
