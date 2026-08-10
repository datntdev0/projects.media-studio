import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';

const PRODUCTION_HOST = 'https://identitytoolkit.googleapis.com';

/** Every way Firebase says "that is not the password". They are not told apart on purpose. */
const WRONG_PASSWORD = ['INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'MISSING_PASSWORD'];

const RATE_LIMITED = 'TOO_MANY_ATTEMPTS_TRY_LATER';

/**
 * The one thing the Admin SDK cannot do: check a password.
 *
 * `updateUser` sets a new password but never verifies the old one, so a change
 * would otherwise rest on the ID token alone and a stolen token would be enough
 * to lock the owner out. This signs in with the current password over the same
 * REST API the browser uses — which the emulator serves too, so the check is
 * identical locally and in production.
 */
@Injectable()
export class IdentityToolkitClient {
  private readonly logger = new Logger(IdentityToolkitClient.name);

  constructor(private readonly config: AppConfigService) {}

  /** Returns quietly if the password is the account's current one, and throws otherwise. */
  async verifyPassword(email: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/accounts:signInWithPassword?key=${this.config.firebase.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No token wanted: the browser already holds a session, this is only a check.
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });

    if (response.ok) {
      return;
    }

    const code = await errorCode(response);

    if (WRONG_PASSWORD.includes(code)) {
      throw new UnauthorizedException('That is not your current password');
    }

    if (code === RATE_LIMITED) {
      throw new HttpException('Too many attempts. Wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // A disabled key, a misconfigured project, an outage: not the caller's fault,
    // and the detail belongs in the log rather than in the response.
    this.logger.error(`signInWithPassword answered ${response.status} ${code}`);

    throw new ServiceUnavailableException('Could not check your password. Try again.');
  }

  /** The emulator serves the real API's paths under its own host. */
  private get baseUrl(): string {
    const { authenticationHost } = this.config.firebase.emulators;

    return authenticationHost ? `http://${authenticationHost}/identitytoolkit.googleapis.com/v1` : `${PRODUCTION_HOST}/v1`;
  }
}

/** `"INVALID_PASSWORD : Password sign-in is disabled"` → `INVALID_PASSWORD`. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };

    return body.error?.message?.split(':')[0]?.trim() ?? '';
  } catch {
    return '';
  }
}
