import type { Db } from '../database/client';
import type { MessageBus } from '../queue/message-bus';
import { QUEUE_NAMES } from '../queue/queue-names';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import { createAppWorkflow, deleteAppWorkflow, getAppWorkflow, listAppWorkflows, updateAppWorkflow } from '../database/repositories/app-workflow.repo';
import { deleteAppWorkflowHistoryByWorkflowId } from '../database/repositories/app-workflow-history.repo';
import { deleteWorkflowExport } from '../helpers/workflow-export';
import {
  AppWorkflowStatus,
  type AppWorkflow,
  type AppWorkflowDraft,
  type CreateAppWorkflowInput,
  type ListAppWorkflowsFilter,
  type UpdateAppWorkflowInput,
} from '../../shared/app-workflow';

export interface AppWorkflowManager {
  get(id: string): AppWorkflow | undefined;
  list(filter?: ListAppWorkflowsFilter): AppWorkflow[];
  create(input: CreateAppWorkflowInput): AppWorkflow;
  update(id: string, input: UpdateAppWorkflowInput): AppWorkflow;
  remove(id: string): void;
  execute(id: string): void;
}

export function stripStamps(item: AppWorkflow): AppWorkflowDraft {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = item;
  return draft;
}

export function createAppWorkflowManager(db: Db, bus: MessageBus): AppWorkflowManager {
  const need = (id: string): AppWorkflow => {
    const item = getAppWorkflow(db, id);
    if (!item) {
      throw new Error(`Workflow ${id} not found`);
    }
    return item;
  };

  return {
    get: (id) => getAppWorkflow(db, id),

    list: (filter) => listAppWorkflows(db, filter),

    create: (input) => {
      const library = getAppLibrary(db, input.libraryId);
      if (!library) {
        throw new Error(`Library item ${input.libraryId} not found`);
      }

      return createAppWorkflow(db, {
        name: input.name,
        description: input.description,
        status: input.status ?? AppWorkflowStatus.Draft,
        libraryId: library.id,
        libraryType: library.type,
        libraryTitle: library.title,
      });
    },

    update: (id, input) => {
      const current = need(id);
      const draft = stripStamps(current);

      if (input.name !== undefined) draft.name = input.name;
      if (input.description !== undefined) draft.description = input.description;
      if (input.status !== undefined) draft.status = input.status;

      return updateAppWorkflow(db, id, draft);
    },

    remove: (id) => {
      need(id);
      deleteAppWorkflow(db, id);
      deleteAppWorkflowHistoryByWorkflowId(db, id);
      deleteWorkflowExport(id);
    },

    execute: (id) => {
      const current = need(id);
      if (current.status === AppWorkflowStatus.Running) {
        throw new Error(`Workflow ${id} is already running`);
      }

      updateAppWorkflow(db, id, { ...stripStamps(current), status: AppWorkflowStatus.Running });
      bus.publish(QUEUE_NAMES.workflowRunRequested, { workflowId: id });
    },
  };
}
