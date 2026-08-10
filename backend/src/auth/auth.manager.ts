import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserRecord } from 'firebase-admin/auth';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { UserDto } from './dto/user.dto';

const USER_NOT_FOUND = 'auth/user-not-found';

/**
 * "Who am I" — the one auth question this service still answers.
 *
 * Firebase Authentication owns accounts and credentials, so there is nothing to
 * store here: the caller's uid comes from the token the guard verified, and the
 * account is read straight from Firebase.
 */
@Injectable()
export class AuthManager {
  constructor(private readonly firebase: FirebaseAdminService) {}

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
