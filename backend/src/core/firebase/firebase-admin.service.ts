import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { App, applicationDefault, cert, getApp, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Database, getDatabase } from 'firebase-admin/database';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { AppConfigService } from '../config/app-config.service';

/**
 * `@google-cloud/storage`'s `Bucket`, reached through the SDK that returns one.
 * That package is a dependency of `firebase-admin` rather than of this one, and
 * importing from it directly would reach past our own manifest.
 */
type Bucket = ReturnType<Storage['bucket']>;

/**
 * The Firebase Admin app, initialised once.
 *
 * Everything that needs to verify a token, read a user, touch a document or write
 * a file goes through `auth`, `firestore` and `bucket`, so the SDK is configured
 * in one place and nothing else has to know whether it is talking to the
 * emulators or to Firebase.
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);

  private app!: App;

  private db!: Firestore;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const { projectId, databaseUrl, emulators } = this.config.firebase;

    // The Admin SDK offers no option for either host — it reads them from the
    // environment itself, under names of its own. This is where ours are handed
    // over, and the only place the SDK's spelling appears.
    if (emulators.authenticationHost) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = emulators.authenticationHost;
    }

    if (emulators.firestoreHost) {
      process.env.FIRESTORE_EMULATOR_HOST = emulators.firestoreHost;
    }

    if (emulators.storageHost) {
      process.env.FIREBASE_STORAGE_EMULATOR_HOST = emulators.storageHost;
    }

    if (emulators.databaseHost) {
      process.env.FIREBASE_DATABASE_EMULATOR_HOST = emulators.databaseHost;
    }

    const credential = this.credential();

    // Without a credential there is nothing for the Google auth libraries to
    // resolve, so stop them probing a GCE metadata server that is not there. The
    // probe fails as a `MetadataLookupWarning` on the console, minutes after
    // whatever request set it off.
    if (!credential.credential) {
      process.env.METADATA_SERVER_DETECTION ??= 'none';
    }

    // `getApp` rather than a second `initializeApp`, which would throw: a watch
    // reload can run this twice in one process.
    const initialised = getApps().length > 0;

    this.app = initialised ? getApp() : initializeApp({ projectId, databaseURL: databaseUrl, ...credential });
    this.db = getFirestore(this.app);

    if (!initialised) {
      // `settings` throws once the client has issued a query, so it is applied
      // here — and only on the app we created, since a reused one has been used.
      //
      // `ignoreUndefinedProperties` makes an absent optional field absent from
      // the document, rather than an error. Firestore has no `undefined`, only
      // `null`, and the difference is one a repository should not have to spell
      // out at every write.
      this.db.settings({ ignoreUndefinedProperties: true });
    }

    this.logger.log(emulators.authenticationHost ? `Firebase project ${projectId} via the auth emulator at ${emulators.authenticationHost}` : `Firebase project ${projectId}`);
    this.logger.log(emulators.firestoreHost ? `Firestore via the emulator at ${emulators.firestoreHost}` : 'Firestore in the cloud');
    this.logger.log(emulators.storageHost ? `Storage via the emulator at ${emulators.storageHost}` : 'Storage in the cloud');
    this.logger.log(emulators.databaseHost ? `Realtime Database via the emulator at ${emulators.databaseHost}` : `Realtime Database ${databaseUrl}`);
  }

  get auth(): Auth {
    return getAuth(this.app);
  }

  get firestore(): Firestore {
    return this.db;
  }

  /** The one bucket this service writes to. Named rather than the project default, so the two cannot differ. */
  get bucket(): Bucket {
    return getStorage(this.app).bucket(this.config.firebase.storageBucket);
  }

  /** The live tree the browser subscribes to. Written through `RealtimeProvider` and nowhere else. */
  get database(): Database {
    return getDatabase(this.app);
  }

  /**
   * No credential against the emulators: they issue unsigned tokens and accept
   * unauthenticated calls, so there is nothing to sign with. All four, because a
   * service pointing at the real Firebase needs one whatever its neighbours do.
   */
  private credential(): { credential?: ReturnType<typeof applicationDefault> } {
    const { emulators, serviceAccountJson } = this.config.firebase;

    if (emulators.authenticationHost && emulators.firestoreHost && emulators.storageHost && emulators.databaseHost) {
      return {};
    }

    return {
      credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson) as ServiceAccount) : applicationDefault(),
    };
  }
}
