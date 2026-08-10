/** A user as the domain sees it. */
export interface User {
  id: string;
  email: string;
  name: string;
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
  abstract findById(id: string): Promise<User | null>;
}
