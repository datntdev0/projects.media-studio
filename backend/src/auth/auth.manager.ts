import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserDto } from './dto/user.dto';
import { User, UserRepository } from './user.repository';

const TOKEN_PREFIX = 'mock.';

/**
 * "Who am I", and nothing else — issuing tokens is Firebase Authentication's job
 * now, so sign-in and sign-up have gone with the passwords they handled.
 *
 * ⚠️ A MOCK, standing in until the token is verified for real. It trusts an
 * unsigned token that is just the user's id, so anyone can mint one. Replacing
 * it with `verifyIdToken` is the next change.
 *
 * The rules live here rather than in the controller, and persistence sits behind
 * `UserRepository`, so swapping either the token scheme or the datastore touches
 * one layer at a time.
 */
@Injectable()
export class AuthManager {
  constructor(private readonly users: UserRepository) {}

  /** The user a bearer token stands for. */
  async me(authorization: string | undefined): Promise<UserDto> {
    const id = userIdFromHeader(authorization);
    const user = id ? await this.users.findById(id) : null;

    if (!user) {
      throw new UnauthorizedException('Missing or invalid access token');
    }

    return publicView(user);
  }
}

/** The credential never leaves the manager. */
function publicView({ id, email, name }: User): UserDto {
  return { id, email, name };
}

function userIdFromHeader(authorization: string | undefined): string | null {
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !token?.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  return token.slice(TOKEN_PREFIX.length) || null;
}
