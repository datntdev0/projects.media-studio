import { useCallback, useEffect, useRef, useState } from 'react';

/** How often a document is re-read while a run is writing into it — same cadence as the run log. */
const POLL_MS = 2_000;

export interface EditableDocument<State, Doc> {
  /** What is on disk, or undefined until the first read lands. */
  state: State | undefined;
  /** The document being edited — null while there is nothing on disk yet. */
  draft: Doc | null;
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  dirty: boolean;
  edit(doc: Doc): void;
  revert(): void;
  /** Runs one main-process action that answers with fresh state, and takes that state as the new baseline. */
  run(work: Promise<State>): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A step's on-disk document as a screen edits it: read through `load` on mount
 * and taken as the draft, written back by whatever action the screen runs. With
 * `live` set — a run is writing into it — it is re-read on a timer, since the
 * step's handler works in the main process and sends nothing back. A poll never
 * throws away an edit in progress: it refreshes the state around the document,
 * and only takes the new document when nothing is unsaved.
 */
export function useEditableDocument<State, Doc>(load: () => Promise<State>, docOf: (state: State) => Doc | null, live: boolean): EditableDocument<State, Doc> {
  const [state, setState] = useState<State | undefined>(undefined);
  const [draft, setDraft] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  // Read inside the poll, which would otherwise close over a stale `dirty`.
  const dirtyRef = useRef(false);

  const apply = useCallback((next: State, force: boolean) => {
    setState(next);
    if (force || !dirtyRef.current) {
      setDraft(docOf(next));
      dirtyRef.current = false;
      setDirty(false);
    }
    setError(undefined);
  }, [docOf]);

  useEffect(() => {
    setLoading(true);
    load()
      .then((next) => apply(next, true))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [load, apply]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // A read that fails mid-run is not worth reporting — the next tick tries again.
      load().then((next) => apply(next, false)).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [live, load, apply]);

  const edit = useCallback((doc: Doc) => {
    setDraft(doc);
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const revert = useCallback(() => {
    setDraft(state === undefined ? null : docOf(state));
    dirtyRef.current = false;
    setDirty(false);
  }, [state, docOf]);

  const run = useCallback(
    async (work: Promise<State>) => {
      setBusy(true);
      try {
        apply(await work, true);
      } catch (err: unknown) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  return { state, draft, loading, busy, error, dirty, edit, revert, run };
}
