import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserRecord } from 'firebase-admin/auth';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDto } from './dto/user.dto';
import { IdentityToolkitClient } from './identity-toolkit.client';

const USER_NOT_FOUND = 'auth/user-not-found';

const INVALID_PASSWORD = 'auth/invalid-password';

/**
 * The signed-in account: who it is, and its password.
 *
 * Firebase Authentication owns accounts and credentials, so there is nothing to
 * store here — the caller's uid comes from the token the guard verified, and
 * everything else is read from or written to Firebase.
 */
@Injectable()
export class AuthManager {
  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly identityToolkit: IdentityToolkitClient,
  ) {}

  /** The account a verified token belongs to. */
  async me(uid: string): Promise<UserDto> {
    try {
      return publicView(await this.firebase.auth.getUser(uid));
    } catch (cause) {
      // A token outlives the account it was issued for; anything else is ours.
      if ((cause as { code?: string }).code === USER_NOT_FOUND) {
        throw new UnauthorizedException('That account no longer exists');
      }

      throw cause;
    }
  }

  /**
   * Sets a new password, once the current one has been proved.
   *
   * The proof is the point: the ID token says the browser holds a session, not
   * that whoever is at the keyboard knows the password.
   *
   * Nothing here revokes what the caller already holds — the guard does not check
   * for revocation, so an ID token stays good until it expires. Firebase itself
   * revokes the account's refresh tokens, ending the session at the next refresh;
   * the emulator does not. A client that wants a session it can rely on either
   * way signs in again with the new password.
   */
  async changePassword(uid: string, email: string | undefined, { currentPassword, newPassword }: ChangePasswordDto): Promise<void> {
    if (!email) {
      throw new BadRequestException('That account has no password to change');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('The new password has to be different from the current one');
    }

    await this.identityToolkit.verifyPassword(email, currentPassword);

    try {
      await this.firebase.auth.updateUser(uid, { password: newPassword });
    } catch (cause) {
      if ((cause as { code?: string }).code === INVALID_PASSWORD) {
        throw new BadRequestException('Firebase would not accept that password');
      }

      throw cause;
    }
  }
}

/** Only the fields a client has any use for. */
function publicView(user: UserRecord): UserDto {
  return {
    id: user.uid,
    email: user.email ?? '',
    name: user.displayName ?? '',
    emailVerified: user.emailVerified,
    photoUrl: user.photoURL ?? null,
    createdAt: user.metadata.creationTime,
    lastSignInAt: user.metadata.lastSignInTime || null,
  };
}
