import { AppConfigService } from './app-config.service';
import { AppConfig, NodeEnv } from './configuration';

const base: AppConfig = {
  nodeEnv: NodeEnv.Development,
  port: 3001,
  logLevel: 'log',
  docsEnabled: true,
};

const readerFor = (config: Partial<AppConfig>) =>
  new AppConfigService({ ...base, ...config });

describe('AppConfigService', () => {
  it('reads each setting from the loaded configuration', () => {
    const reader = readerFor({
      port: 4000,
      logLevel: 'debug',
      docsEnabled: false,
    });

    expect(reader.nodeEnv).toBe(NodeEnv.Development);
    expect(reader.port).toBe(4000);
    expect(reader.logLevel).toBe('debug');
    expect(reader.docsEnabled).toBe(false);
  });

  it.each([
    [NodeEnv.Production, true, false],
    [NodeEnv.Test, false, true],
    [NodeEnv.Development, false, false],
  ])('classifies %s', (nodeEnv, isProduction, isTest) => {
    const reader = readerFor({ nodeEnv });

    expect(reader.isProduction).toBe(isProduction);
    expect(reader.isTest).toBe(isTest);
  });
});
