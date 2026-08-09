import { InMemoryUserRepository } from './in-memory-user.repository';

describe('InMemoryUserRepository', () => {
  it('comes seeded, so login works out of the box', async () => {
    await expect(
      new InMemoryUserRepository().findByEmail('dat@media.studio'),
    ).resolves.toMatchObject({ name: 'Dat Nguyen' });
  });

  it('matches an email regardless of case or surrounding space', async () => {
    const users = new InMemoryUserRepository();

    await expect(
      users.findByEmail('  DAT@Media.Studio '),
    ).resolves.not.toBeNull();
  });

  it('reports an unknown email as absent rather than throwing', async () => {
    await expect(
      new InMemoryUserRepository().findByEmail('nobody@media.studio'),
    ).resolves.toBeNull();
  });

  it('gives each created user an id', async () => {
    const users = new InMemoryUserRepository();

    const created = await users.create({
      email: 'new@media.studio',
      name: 'New Person',
      password: 'password',
    });

    expect(created.id).toEqual(expect.any(String));
    await expect(users.findById(created.id)).resolves.toMatchObject({
      email: 'new@media.studio',
    });
  });

  it('finds a created user by email too', async () => {
    const users = new InMemoryUserRepository();
    await users.create({
      email: 'new@media.studio',
      name: 'New Person',
      password: 'password',
    });

    await expect(users.findByEmail('new@media.studio')).resolves.not.toBeNull();
  });

  it('reports an unknown id as absent', async () => {
    await expect(
      new InMemoryUserRepository().findById('nope'),
    ).resolves.toBeNull();
  });

  it('hands out copies, so a caller cannot mutate the store', async () => {
    const users = new InMemoryUserRepository();

    const first = await users.findByEmail('dat@media.studio');
    first!.name = 'Someone Else';

    await expect(users.findByEmail('dat@media.studio')).resolves.toMatchObject({
      name: 'Dat Nguyen',
    });
  });

  it('keeps one instance of the store separate from another', async () => {
    await new InMemoryUserRepository().create({
      email: 'new@media.studio',
      name: 'New Person',
      password: 'password',
    });

    await expect(
      new InMemoryUserRepository().findByEmail('new@media.studio'),
    ).resolves.toBeNull();
  });
});
