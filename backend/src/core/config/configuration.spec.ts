import { loadConfig, NodeEnv } from './configuration';

describe('loadConfig', () => {
  it('falls back to a working default for every setting', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: NodeEnv.Development,
      port: 3001,
      logLevel: 'log',
      docsEnabled: true,
    });
  });

  it('reads the values an environment supplies', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        API_DOCS_ENABLED: 'false',
      }),
    ).toEqual({
      nodeEnv: NodeEnv.Production,
      port: 8080,
      logLevel: 'warn',
      docsEnabled: false,
    });
  });

  it('hands back a number for the port', () => {
    // Everything arrives as a string, and `port + 1` on a string is a bug.
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it.each([['abc'], [''], ['0']])(
    'falls back to the default port for %p',
    (given) => {
      expect(loadConfig({ PORT: given }).port).toBe(3001);
    },
  );

  it('only treats "false" as off, and does not cast the string', () => {
    // `Boolean('false')` is `true`, which is why the flag is read.
    expect(loadConfig({ API_DOCS_ENABLED: 'false' }).docsEnabled).toBe(false);
    expect(loadConfig({ API_DOCS_ENABLED: 'true' }).docsEnabled).toBe(true);
    expect(loadConfig({}).docsEnabled).toBe(true);
  });
});
