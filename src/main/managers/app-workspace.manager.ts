import type { Db } from '@/main/database/client';
import { createAppWorkspace, deleteAppWorkspace, deleteAppWorkspaceStepsByWorkspaceId, getAppWorkspace, listAppWorkspaces, updateAppWorkspace } from '@/main/database/repositories/app-workspace.repo';
import { deleteAppWorkspaceRunsByWorkspaceId } from '@/main/database/repositories/app-workspace-run.repo';
import { getAppLibrary } from '@/main/database/repositories/app-library.repo';
import { AppLibraryType } from '@/shared/app-library';
import { DEFAULT_SPEECH } from '@/shared/app-workspace-narration';
import { WorkspacePreset, WorkspaceStatus, WorkspaceStepState, plannedStepsOf, type AppWorkspace, type CreateAppWorkspaceInput, type ListAppWorkspacesFilter, type UpdateAppWorkspaceInput, type WorkspaceStep } from '@/shared/app-workspace';

export interface AppWorkspaceManager {
  get(id: string): AppWorkspace | undefined;
  list(filter?: ListAppWorkspacesFilter): AppWorkspace[];
  create(input: CreateAppWorkspaceInput): AppWorkspace;
  update(id: string, input: UpdateAppWorkspaceInput): AppWorkspace;
  remove(id: string): void;
}

/** The pipeline a new workspace starts with — every step waiting, and unscoped until a run counts its units. */
function initialSteps(input: CreateAppWorkspaceInput): WorkspaceStep[] {
  return plannedStepsOf(input.preset, input.translateEnabled).map((step) => ({
    key: step.key,
    idx: step.idx,
    state: WorkspaceStepState.Pending,
    doneCount: 0,
    failedCount: 0,
    totalCount: 0,
  }));
}

/** Both create and update refuse a blank name — a workspace is found by it in the listing. */
function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('A workspace needs a name.');
  }
  return trimmed;
}

export function createAppWorkspaceManager(db: Db): AppWorkspaceManager {
  const need = (id: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, id);
    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }
    return workspace;
  };

  const needNovel = (libraryId: string) => {
    const item = getAppLibrary(db, libraryId);
    if (!item) {
      throw new Error(`Library item ${libraryId} not found`);
    }
    if (item.type !== AppLibraryType.Novel) {
      throw new Error('A workspace runs over a library novel — an image or video set is not eligible.');
    }
  };

  return {
    get: (id) => getAppWorkspace(db, id),

    list: (filter) => listAppWorkspaces(db, filter),

    create: (input) => {
      const name = requireName(input.name);
      if (input.preset !== WorkspacePreset.AudioNovel) {
        throw new Error(`The ${input.preset} preset is not available yet.`);
      }
      needNovel(input.libraryId);

      return createAppWorkspace(db, {
        name,
        description: input.description.trim(),
        preset: input.preset,
        libraryId: input.libraryId,
        status: WorkspaceStatus.Draft,
        // Null: a new workspace follows config.json until its own picker changes it.
        llm: null,
        speech: DEFAULT_SPEECH,
        steps: initialSteps(input),
        lastRunAt: null,
      });
    },

    update: (id, input) => {
      const current = need(id);
      return updateAppWorkspace(db, id, {
        name: input.name === undefined ? current.name : requireName(input.name),
        description: input.description === undefined ? current.description : input.description.trim(),
      });
    },

    remove: (id) => {
      need(id);
      deleteAppWorkspaceRunsByWorkspaceId(db, id);
      deleteAppWorkspaceStepsByWorkspaceId(db, id);
      deleteAppWorkspace(db, id);
    },
  };
}
