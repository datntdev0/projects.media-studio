import { NodeEnv, validate } from './env.validation';

describe('validate', () => {
  it('fills in every default for an empty environment', () => {
    const config = validate({});

    expect(config).toMatchObject({
      NODE_ENV: NodeEnv.Development,
      PORT: 3001,
      LOG_LEVEL: 'log',
      API_DOCS_ENABLED: true,
    });
  });

  it('reads the values an environment supplies', () => {
    const config = validate({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      API_DOCS_ENABLED: 'false',
    });

    expect(config).toMatchObject({
      NODE_ENV: NodeEnv.Production,
      LOG_LEVEL: 'warn',
      API_DOCS_ENABLED: false,
    });
  });

  it('turns the port into a number', () => {
    // Everything arrives as a string, and `PORT + 1` on a string is a bug.
    expect(validate({ PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['TRUE', true],
    ['  false  ', false],
  ])('reads API_DOCS_ENABLED=%s as %s', (given, expected) => {
    expect(validate({ API_DOCS_ENABLED: given }).API_DOCS_ENABLED).toBe(
      expected,
    );
  });

  it('does not mistake the string "false" for a truthy flag', () => {
    // The whole reason API_DOCS_ENABLED is not `Type(() => Boolean)`.
    expect(validate({ API_DOCS_ENABLED: 'false' }).API_DOCS_ENABLED).toBe(
      false,
    );
  });

  it('leaves unrelated variables alone', () => {
    expect(validate({ HOME: '/root' })).toMatchObject({ HOME: '/root' });
  });

  it.each([
    ['PORT', { PORT: 'abc' }],
    ['PORT', { PORT: '0' }],
    ['PORT', { PORT: '70000' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'chatty' }],
    ['API_DOCS_ENABLED', { API_DOCS_ENABLED: 'maybe' }],
  ])('refuses to start on a bad %s', (variable, env) => {
    expect(() => validate(env)).toThrow(new RegExp(variable));
  });

  it('names the values it would have accepted', () => {
    // A boot error that says "must be one of the following values:" and then
    // lists nothing is no help at all.
    expect(() => validate({ LOG_LEVEL: 'chatty' })).toThrow(/warn/);
    expect(() => validate({ NODE_ENV: 'staging' })).toThrow(/production/);
  });

  it('reports every bad variable at once', () => {
    // One restart per mistake is a miserable way to fix an environment.
    expect(() => validate({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
  });
});
