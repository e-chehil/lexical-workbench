/**
 * Route state bound to `location.hash`.
 *
 * Navigation writes the hash, which pushes one history entry, so browser back/forward restore the
 * previous workspace, query and selection. `replace` overwrites the current entry (used for the
 * initial normalisation so a bare URL does not leave an extra history step).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { decodeRoute, encodeRoute, isSameRoute, type AppRoute } from '../routing/codec.ts';

export interface RouteContextValue {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  replace: (route: AppRoute) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

function currentRoute(): AppRoute {
  if (typeof window === 'undefined') return { workspace: 'explore' };
  return decodeRoute(window.location.hash);
}

export function RouteProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<AppRoute>(currentRoute);

  useEffect(() => {
    const sync = (): void => setRoute(currentRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // Canonicalise a bare URL once, without adding a history entry.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '') {
      const encoded = encodeRoute({ workspace: 'explore' });
      window.history.replaceState(null, '', encoded);
      setRoute(decodeRoute(encoded));
    }
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    if (typeof window === 'undefined') return;
    const encoded = encodeRoute(next);
    if (window.location.hash === encoded) {
      setRoute(next); // same page state: no new history entry, but keep the object fresh
      return;
    }
    window.location.hash = encoded.slice(1); // assigning the hash pushes one entry
    setRoute(next);
  }, []);

  const replace = useCallback((next: AppRoute) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', encodeRoute(next));
    setRoute(next);
  }, []);

  const value = useMemo<RouteContextValue>(() => ({ route, navigate, replace }), [route, navigate, replace]);
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteContextValue {
  const value = useContext(RouteContext);
  if (!value) throw new Error('useRoute() must be used inside <RouteProvider>');
  return value;
}

/** Navigates only when the target differs from the current route (avoids duplicate entries). */
export function useNavigateIfChanged(): (next: AppRoute) => void {
  const { route, navigate } = useRoute();
  return useCallback(
    (next: AppRoute) => {
      if (!isSameRoute(route, next)) navigate(next);
    },
    [route, navigate]
  );
}
