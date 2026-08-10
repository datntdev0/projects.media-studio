import { Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { SYSTEM_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { FirestoreRepository } from '../core/firebase/firestore.repository';
import { SystemRecord } from './entities/system-info.entity';

/** The collection holds one document, and this is it. */
const CURRENT = 'current';

/** What a boot knows about itself. The dates are this class's own. */
export type SystemBuild = Omit<SystemRecord, 'id' | 'installedAt' | 'lastStartedAt'>;

/**
 * The service's own record of itself.
 *
 * The first repository, and the one that proves the layer works end to end:
 * `recordStart` writes on every boot and `read` is what `GET /system` answers
 * with, so a Firestore that is misconfigured says so at startup rather than
 * three features later.
 */
@Injectable()
export class SystemRepository extends FirestoreRepository<SystemRecord> {
  protected readonly collectionName = SYSTEM_COLLECTION;

  constructor(firebase: FirebaseAdminService) {
    super(firebase);
  }

  read(): Promise<SystemRecord | null> {
    return this.findById(CURRENT);
  }

  /**
   * Stamps this boot onto the record, creating it the first time.
   *
   * A transaction because `installedAt` has to survive: it is the one field that
   * must keep the value already there, and reading it outside a transaction
   * would race two instances starting together — the second could read nothing,
   * and overwrite the first's install date with its own.
   */
  async recordStart(build: SystemBuild): Promise<SystemRecord> {
    const document = this.collection.doc(CURRENT);
    const startedAt = Timestamp.now();

    const installedAt = await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const installed = (snapshot.get('installedAt') as Timestamp | undefined) ?? startedAt;

      transaction.set(document, { ...build, installedAt: installed, lastStartedAt: startedAt });

      return installed;
    });

    // Built from what was just written, rather than read back: the write is the
    // authority on its own result, and a second round trip could only disagree.
    return {
      id: CURRENT,
      ...build,
      installedAt: installedAt.toDate().toISOString(),
      lastStartedAt: startedAt.toDate().toISOString(),
    };
  }
}
