/** A user as the domain sees it, credential included. */
export interface User {
  id: string;
  email: string;
  name: string;
  /**
   * MOCK ONLY — stored as given. A real implementation stores a hash from a
   * password-hashing function (argon2, bcrypt) and never the password itself.
   */
  password: string;
}

/**
 * The persistence contract for users, and the DI token for it.
 *
 * An abstract class rather than an interface: it is a type the manager can be
 * checked against *and* a token Nest can resolve, so the module decides which
 * implementation is wired and a spec swaps in a double with
 * `.overrideProvider(UserRepository)`. Nothing outside this module sees it —
 * `AuthModule` exports the manager only.
 */
export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<User | null>;

  abstract findById(id: string): Promise<User | null>;

  abstract create(user: Omit<User, 'id'>): Promise<User>;
}
