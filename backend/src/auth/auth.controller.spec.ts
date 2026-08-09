import { AuthController } from './auth.controller';
import { AuthManager } from './auth.manager';
import { SessionDto, UserDto } from './dto/session.dto';

const user: UserDto = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dat@media.studio',
  name: 'Dat Nguyen',
};

const session: SessionDto = {
  accessToken: 'mock.00000000-0000-4000-8000-000000000001',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user,
};

function managerStub() {
  const login = jest.fn().mockResolvedValue(session);
  const register = jest.fn().mockResolvedValue(session);
  const me = jest.fn().mockResolvedValue(user);

  return {
    login,
    register,
    me,
    manager: { login, register, me } as unknown as AuthManager,
  };
}

/**
 * A controller is an HTTP adapter and nothing else, so what is worth asserting
 * is that it hands the work over unchanged — a rule decided here would be a
 * rule in the wrong layer.
 */
describe('AuthController', () => {
  it('passes credentials to the manager', async () => {
    const { manager, login } = managerStub();
    const credentials = { email: 'dat@media.studio', password: 'password' };

    await expect(new AuthController(manager).login(credentials)).resolves.toBe(
      session,
    );
    expect(login).toHaveBeenCalledWith(credentials);
  });

  it('passes registration details to the manager', async () => {
    const { manager, register } = managerStub();
    const details = {
      email: 'new@media.studio',
      name: 'New Person',
      password: 'password',
    };

    await expect(new AuthController(manager).register(details)).resolves.toBe(
      session,
    );
    expect(register).toHaveBeenCalledWith(details);
  });

  it('passes the authorization header through as given', async () => {
    const { manager, me } = managerStub();

    await expect(
      new AuthController(manager).me('Bearer mock.abc'),
    ).resolves.toBe(user);
    expect(me).toHaveBeenCalledWith('Bearer mock.abc');
  });

  it('asks about the current user even with no header, so the manager decides', async () => {
    const { manager, me } = managerStub();

    await new AuthController(manager).me();

    expect(me).toHaveBeenCalledWith(undefined);
  });
});
