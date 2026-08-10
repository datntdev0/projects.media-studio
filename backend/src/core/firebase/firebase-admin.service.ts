import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { App, applicationDefault, cert, getApp, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { AppConfigService } from '../config/app-config.service';

/**
 * The Firebase Admin app, initialised once.
 *
 * Everything that needs to verify a token or read a user goes through `auth`, so
 * the SDK is configured in one place and nothing else has to know whether it is
 * talking to the emulator or to Firebase.
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);

  private app!: App;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const { projectId, authEmulatorHost } = this.config.firebase;

    if (authEmulatorHost) {
      // The Admin SDK offers no option for this — it reads the variable itself.
      process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
    }

    // `getApp` rather than a second `initializeApp`, which would throw: a watch
    // reload can run this twice in one process.
    this.app = getApps().length ? getApp() : initializeApp({ projectId, ...this.credential() });

    this.logger.log(authEmulatorHost ? `Firebase project ${projectId} via the auth emulator at ${authEmulatorHost}` : `Firebase project ${projectId}`);
  }

  get auth(): Auth {
    return getAuth(this.app);
  }

  /**
   * No credential against the emulator: it issues unsigned tokens and
   * `verifyIdToken` skips the signature check, so there is nothing to sign with.
   */
  private credential(): { credential?: ReturnType<typeof applicationDefault> } {
    const { authEmulatorHost, serviceAccountJson } = this.config.firebase;

    if (authEmulatorHost) {
      return {};
    }

    return {
      credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson) as ServiceAccount) : applicationDefault(),
    };
  }
}
