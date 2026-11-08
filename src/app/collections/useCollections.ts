/** Collections CRUD bound to the open Dexie database. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Collection, TargetRef, LexQuery } from '../../v2/index.ts';
import { DexieCollections } from '../../v2/store/collections.ts';
import type { LexicalWorkbenchDB } from '../../v2/store/dexieStore.ts';

export function useCollections(db: LexicalWorkbenchDB | null, version: number) {
  const [items, setItems] = useState<Collection[]>([]);
  const api = useMemo(() => (db ? new DexieCollections(db.collections) : null), [db]);

  const refresh = useCallback(async () => {
    if (!api) {
      setItems([]);
      return;
    }
    setItems(await api.list());
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  const createStatic = useCallback(
    async (name: string, targets: readonly TargetRef[], description = '') => {
      if (!api) throw new Error('本地学习库不可用');
      const created = await api.createStatic({ name, targets, description });
      await refresh();
      return created;
    },
    [api, refresh]
  );

  const createDynamic = useCallback(
    async (name: string, query: LexQuery, description = '') => {
      if (!api) throw new Error('本地学习库不可用');
      const created = await api.createDynamic({ name, query, description });
      await refresh();
      return created;
    },
    [api, refresh]
  );

  const addTargets = useCallback(
    async (id: string, targets: readonly TargetRef[]) => {
      if (!api) throw new Error('本地学习库不可用');
      const next = await api.addTargets(id, targets);
      await refresh();
      return next;
    },
    [api, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!api) throw new Error('本地学习库不可用');
      const removed = await api.remove(id);
      await refresh();
      return removed;
    },
    [api, refresh]
  );

  return { items, createStatic, createDynamic, addTargets, remove, refresh, ready: api !== null };
}
