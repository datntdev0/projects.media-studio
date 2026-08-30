import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppWorkflowActivity, CreateAppWorkflowActivityInput, UpdateAppWorkflowActivityInput } from '../../../shared/app-workflow-activity';
import { buildConfigFields, configOf } from './workflowActivityFormat';

export interface AppWorkflowActivitiesState {
  items: AppWorkflowActivity[];
  loading: boolean;
  error: string | undefined;
  dirty: boolean;
  saving: boolean;
  saveError: string | undefined;
  /** Adds a new activity to local state only — it has no server id until `save()` runs. */
  add(input: CreateAppWorkflowActivityInput): AppWorkflowActivity;
  /** Patches an activity in local state only. */
  patch(id: string, input: UpdateAppWorkflowActivityInput): void;
  /** Removes an activity from local state only, scrubbing it out of any other activity's dependencies. */
  remove(id: string): void;
  /** Repositions many activities in local state in one update, e.g. for auto-layout. */
  moveMany(positions: { id: string; x: number; y: number }[]): void;
  /** Reconciles local state against the database: creates new activities, updates changed ones, deletes removed ones. */
  save(): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function activityEquals(a: AppWorkflowActivity, b: AppWorkflowActivity): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.x === b.x &&
    a.y === b.y &&
    a.enabled === b.enabled &&
    sameIds(a.dependencies, b.dependencies) &&
    JSON.stringify(configOf(a)) === JSON.stringify(configOf(b))
  );
}

export function useAppWorkflowActivities(workflowId: string): AppWorkflowActivitiesState {
  const [items, setItems] = useState<AppWorkflowActivity[]>([]);
  const [original, setOriginal] = useState<AppWorkflowActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    window.appWorkflowActivityApi
      .list(workflowId)
      .then((list) => {
        setItems(list);
        setOriginal(list);
        setError(undefined);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [workflowId]);

  const dirty = useMemo(() => {
    if (items.length !== original.length) return true;
    const originalById = new Map(original.map((a) => [a.id, a]));
    return items.some((item) => {
      const prior = originalById.get(item.id);
      return !prior || !activityEquals(item, prior);
    });
  }, [items, original]);

  const add = useCallback(
    (input: CreateAppWorkflowActivityInput): AppWorkflowActivity => {
      const now = Date.now();
      const created: AppWorkflowActivity = {
        id: crypto.randomUUID(),
        workflowId,
        type: input.type,
        name: input.name,
        description: input.description ?? '',
        x: input.x,
        y: input.y,
        enabled: input.enabled ?? true,
        dependencies: input.dependencies ?? [],
        createdAt: now,
        updatedAt: now,
        ...buildConfigFields(input.type, input.config),
      };
      setItems((current) => [...current, created]);
      return created;
    },
    [workflowId],
  );

  const patch = useCallback((id: string, input: UpdateAppWorkflowActivityInput) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const fields = input.config ? buildConfigFields(item.type, input.config) : {};
        return {
          ...item,
          ...fields,
          name: input.name ?? item.name,
          description: input.description ?? item.description,
          x: input.x ?? item.x,
          y: input.y ?? item.y,
          enabled: input.enabled ?? item.enabled,
          dependencies: input.dependencies ?? item.dependencies,
        };
      }),
    );
  }, []);

  const moveMany = useCallback((positions: { id: string; x: number; y: number }[]) => {
    const byId = new Map(positions.map((p) => [p.id, p]));
    setItems((current) => current.map((item) => {
      const next = byId.get(item.id);
      return next ? { ...item, x: next.x, y: next.y } : item;
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) =>
      current.filter((item) => item.id !== id).map((item) => (item.dependencies.includes(id) ? { ...item, dependencies: item.dependencies.filter((depId) => depId !== id) } : item)),
    );
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const originalById = new Map(original.map((a) => [a.id, a]));
      const currentIds = new Set(items.map((a) => a.id));
      const deletedIds = original.filter((a) => !currentIds.has(a.id)).map((a) => a.id);

      const idMap = new Map<string, string>();
      for (const draft of items) {
        if (originalById.has(draft.id)) continue;
        const created = await window.appWorkflowActivityApi.create(workflowId, {
          type: draft.type,
          name: draft.name,
          description: draft.description,
          x: draft.x,
          y: draft.y,
          enabled: draft.enabled,
          config: configOf(draft),
        });
        idMap.set(draft.id, created.id);
      }

      const remapId = (id: string) => idMap.get(id) ?? id;

      for (const draft of items) {
        const realId = remapId(draft.id);
        const dependencies = draft.dependencies.map(remapId).filter((depId) => !deletedIds.includes(depId));
        const prior = originalById.get(draft.id);
        if (prior && activityEquals(draft, { ...prior, dependencies })) continue;
        await window.appWorkflowActivityApi.update(workflowId, realId, {
          name: draft.name,
          description: draft.description,
          x: draft.x,
          y: draft.y,
          enabled: draft.enabled,
          config: configOf(draft),
          dependencies,
        });
      }

      for (const id of deletedIds) {
        await window.appWorkflowActivityApi.remove(workflowId, id);
      }

      const fresh = await window.appWorkflowActivityApi.list(workflowId);
      setItems(fresh);
      setOriginal(fresh);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [workflowId, items, original]);

  return { items, loading, error, dirty, saving, saveError, add, patch, remove, moveMany, save };
}
