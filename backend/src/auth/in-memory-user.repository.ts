import { Injectable } from '@nestjs/common';
import { User, UserRepository } from './user.repository';

/** Seeded so `auth/me` has something to resolve out of the box. */
const SEED: User[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'dat@media.studio',
    name: 'Dat Nguyen',
  },
];

/**
 * Users in a Map, for as long as the process lives.
 *
 * The stand-in for a real lookup, and on its way out: once the ID token is
 * verified for real, the user comes from Firebase and this goes with it.
 */
@Injectable()
export class InMemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, User>();

  constructor() {
    super();
    for (const user of SEED) {
      this.users.set(user.id, { ...user });
    }
  }

  findById(id: string): Promise<User | null> {
    const found = this.users.get(id);

    return Promise.resolve(found ? { ...found } : null);
  }
}
