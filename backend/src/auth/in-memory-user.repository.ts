import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User, UserRepository } from './user.repository';

/** Seeded so `auth/login` has something to succeed with out of the box. */
const SEED: User[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'dat@media.studio',
    name: 'Dat Nguyen',
    password: 'password',
  },
];

/**
 * Users in a Map, for as long as the process lives.
 *
 * The datastore is not chosen yet, so this stands in — and because the manager
 * depends on `UserRepository` and not on this class, replacing it later is one
 * line in `AuthModule` with nothing else to touch. Email is matched
 * case-insensitively, which any real implementation has to do too.
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

  findByEmail(email: string): Promise<User | null> {
    const wanted = normalise(email);
    const found = [...this.users.values()].find(
      (user) => normalise(user.email) === wanted,
    );

    return Promise.resolve(found ? { ...found } : null);
  }

  findById(id: string): Promise<User | null> {
    const found = this.users.get(id);

    return Promise.resolve(found ? { ...found } : null);
  }

  create(user: Omit<User, 'id'>): Promise<User> {
    const created: User = { ...user, id: randomUUID() };
    this.users.set(created.id, created);

    return Promise.resolve({ ...created });
  }
}

const normalise = (email: string): string => email.trim().toLowerCase();
