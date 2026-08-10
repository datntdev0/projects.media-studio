import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionDto, UserDto } from './dto/session.dto';
import { User, UserRepository } from './user.repository';

/** Mock token lifetime, in seconds. */
const TOKEN_TTL_SECONDS = 3600;

const TOKEN_PREFIX = 'mock.';

/**
 * Sign-in, sign-up and "who am I".
 *
 * ⚠️ A MOCK, standing in until real authentication is chosen. It compares
 * passwords in plain text and issues an unsigned token that is just the user's
 * id — anyone can mint one. It exists so the frontend has endpoints to build
 * against and so the layering has a second, non-trivial example. Replace the
 * credential check with a password hash and the token with a signed JWT (or a
 * server-side session) before this is reachable by anyone but us.
 *
 * The rules live here rather than in the controller, and persistence sits behind
 * `UserRepository`, so swapping either the token scheme or the datastore touches
 * one layer at a time.
 */
@Injectable()
export class AuthManager {
  constructor(private readonly users: UserRepository) {}

  async login({ email, password }: LoginDto): Promise<SessionDto> {
    const user = await this.users.findByEmail(email);

    // One message for both "no such email" and "wrong password": saying which
    // is which tells an attacker whose accounts exist.
    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.sessionFor(user);
  }

  async register({ email, name, password }: RegisterDto): Promise<SessionDto> {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('That email is already registered');
    }

    const user = await this.users.create({ email, name, password });

    return this.sessionFor(user);
  }

  /** The user a bearer token stands for. */
  async me(authorization: string | undefined): Promise<UserDto> {
    const id = userIdFromHeader(authorization);
    const user = id ? await this.users.findById(id) : null;

    if (!user) {
      throw new UnauthorizedException('Missing or invalid access token');
    }

    return publicView(user);
  }

  private sessionFor(user: User): SessionDto {
    return {
      accessToken: `${TOKEN_PREFIX}${user.id}`,
      tokenType: 'Bearer',
      expiresIn: TOKEN_TTL_SECONDS,
      user: publicView(user),
    };
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
