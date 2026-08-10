import { NodeEnv } from '../../core/config/configuration';
import { FirestoreEntity } from '../../core/firebase/firestore.repository';

/**
 * The data shape this build expects to find in Firestore. Bumped by hand when a
 * migration lands, so a deployment can say what it was written against.
 */
export const SCHEMA_VERSION = 1;

/**
 * What the `system/current` document holds.
 *
 * The build fields are stored rather than derived on purpose: `lastStartedAt` is
 * only worth reading next to *what* started — which build, configured for which
 * environment, serving which API version. Those are facts about the process that
 * wrote the record, not about the one answering now, and reading them from the
 * live configuration would report the answering process as though the record had
 * said it.
 */
export interface SystemRecord extends FirestoreEntity {
  /** Always `current` — this collection holds one document. */
  id: string;
  name: string;
  version: string;
  schemaVersion: number;
  /** The environment that build was configured for. */
  environment: NodeEnv;
  /** The version its versioned endpoints answer on when a client names none. */
  apiVersion: string;
  /** First boot against this database. Written once, never rewritten. */
  installedAt: string;
  /** Rewritten on every boot. */
  lastStartedAt: string;
}

/** What the service reports: the record, minus the id a client has nothing to do with. */
export type SystemInfo = Omit<SystemRecord, 'id'>;
