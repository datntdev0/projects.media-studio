import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthManager } from './auth.manager';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { UserRepository } from './user.repository';

const SEEDED = { email: 'dat@media.studio', password: 'password' };

/**
 * A manager is framework-free, so its spec needs no Nest fixture. The real
 * in-memory repository stands in for the datastore — it is the implementation
 * the module wires today, and using it keeps the spec honest about behaviour
 * like case-insensitive email matching.
 */
function managerWith(users: UserRepository = new InMemoryUserRepository()) {
  return { manager: new AuthManager(users), users };
}

describe('AuthManager', () => {
  describe('login', () => {
    it('hands back a session for the right credentials', async () => {
      const { manager } = managerWith();

      const session = await manager.login(SEEDED);

      expect(session).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: { email: SEEDED.email, name: 'Dat Nguyen' },
      });
      expect(session.accessToken).toContain(session.user.id);
    });

    it('never returns the password', async () => {
      const { manager } = managerWith();

      const session = await manager.login(SEEDED);

      expect(JSON.stringify(session)).not.toContain(SEEDED.password);
      expect(session.user).not.toHaveProperty('password');
    });

    it('accepts the email in any case', async () => {
      const { manager } = managerWith();

      await expect(
        manager.login({ ...SEEDED, email: 'DAT@Media.Studio' }),
      ).resolves.toMatchObject({ user: { email: SEEDED.email } });
    });

    it('rejects a wrong password', async () => {
      const { manager } = managerWith();

      await expect(
        manager.login({ ...SEEDED, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      const { manager } = managerWith();

      await expect(
        manager.login({ email: 'nobody@media.studio', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('says the same thing either way, so accounts cannot be enumerated', async () => {
      const { manager } = managerWith();

      const wrongPassword = await manager
        .login({ ...SEEDED, password: 'wrong-password' })
        .catch((error: Error) => error.message);
      const unknownEmail = await manager
        .login({ email: 'nobody@media.studio', password: 'password' })
        .catch((error: Error) => error.message);

      expect(wrongPassword).toBe(unknownEmail);
    });
  });

  describe('register', () => {
    const newcomer = {
      email: 'new@media.studio',
      name: 'New Person',
      password: 'password',
    };

    it('creates the account and signs it in', async () => {
      const { manager } = managerWith();

      const session = await manager.register(newcomer);

      expect(session.user).toMatchObject({
        email: newcomer.email,
        name: newcomer.name,
      });
      expect(session.user.id).toEqual(expect.any(String));
    });

    it('leaves the new account able to log in', async () => {
      const { manager } = managerWith();
      await manager.register(newcomer);

      await expect(
        manager.login({ email: newcomer.email, password: newcomer.password }),
      ).resolves.toMatchObject({ user: { email: newcomer.email } });
    });

    it('refuses an email that is already registered', async () => {
      const { manager } = managerWith();

      await expect(
        manager.register({ ...newcomer, email: SEEDED.email }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a duplicate in a different case', async () => {
      const { manager } = managerWith();

      await expect(
        manager.register({ ...newcomer, email: 'DAT@media.studio' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('me', () => {
    it('resolves the user a token stands for', async () => {
      const { manager } = managerWith();
      const { accessToken, user } = await manager.login(SEEDED);

      await expect(manager.me(`Bearer ${accessToken}`)).resolves.toEqual(user);
    });

    it.each([
      ['no header', undefined],
      ['an empty header', ''],
      ['the wrong scheme', 'Basic mock.00000000-0000-4000-8000-000000000001'],
      ['a token with no prefix', 'Bearer 00000000-0000-4000-8000-000000000001'],
      ['a prefix with no id', 'Bearer mock.'],
      ['an unknown user', 'Bearer mock.does-not-exist'],
    ])('rejects %s', async (_, header) => {
      const { manager } = managerWith();

      await expect(manager.me(header)).rejects.toThrow(UnauthorizedException);
    });

    it('accepts the scheme in any case', async () => {
      const { manager } = managerWith();
      const { accessToken } = await manager.login(SEEDED);

      await expect(manager.me(`bearer ${accessToken}`)).resolves.toBeDefined();
    });
  });
});
