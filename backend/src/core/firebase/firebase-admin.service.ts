import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { App, applicationDefault, cert, getApp, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { AppConfigService } from '../config/app-config.service';

/**
 * The Firebase Admin app, initialised once.
 *
 * Everything that needs to verify a token, read a user or touch a document goes
 * through `auth` and `firestore`, so the SDK is configured in one place and
 * nothing else has to know whether it is talking to the emulators or to Firebase.
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);

  private app!: App;

  private db!: Firestore;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const { projectId, emulators } = this.config.firebase;

    // The Admin SDK offers no option for either host — it reads them from the
    // environment itself, under names of its own. This is where ours are handed
    // over, and the only place the SDK's spelling appears.
    if (emulators.authenticationHost) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = emulators.authenticationHost;
    }

    if (emulators.firestoreHost) {
      process.env.FIRESTORE_EMULATOR_HOST = emulators.firestoreHost;
    }

    // `getApp` rather than a second `initializeApp`, which would throw: a watch
    // reload can run this twice in one process.
    const initialised = getApps().length > 0;

    this.app = initialised ? getApp() : initializeApp({ projectId, ...this.credential() });
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
  }

  get auth(): Auth {
    return getAuth(this.app);
  }

  get firestore(): Firestore {
    return this.db;
  }

  /**
   * No credential against the emulators: they issue unsigned tokens and accept
   * unauthenticated calls, so there is nothing to sign with.
   */
  private credential(): { credential?: ReturnType<typeof applicationDefault> } {
    const { emulators, serviceAccountJson } = this.config.firebase;

    if (emulators.authenticationHost && emulators.firestoreHost) {
      return {};
    }

    return {
      credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson) as ServiceAccount) : applicationDefault(),
    };
  }
}
