import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { EnvironmentVariables, NodeEnv } from './env.validation';

function readerFor(env: Partial<EnvironmentVariables>): AppConfigService {
  const config = {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return new AppConfigService(config);
}

describe('AppConfigService', () => {
  it('reads each setting from the validated environment', () => {
    const reader = readerFor({
      NODE_ENV: NodeEnv.Development,
      PORT: 3001,
      LOG_LEVEL: 'debug',
      API_DOCS_ENABLED: true,
    });

    expect(reader.nodeEnv).toBe(NodeEnv.Development);
    expect(reader.port).toBe(3001);
    expect(reader.logLevel).toBe('debug');
    expect(reader.docsEnabled).toBe(true);
  });

  it.each([
    [NodeEnv.Production, true, false],
    [NodeEnv.Test, false, true],
    [NodeEnv.Development, false, false],
  ])('classifies %s', (nodeEnv, isProduction, isTest) => {
    const reader = readerFor({ NODE_ENV: nodeEnv });

    expect(reader.isProduction).toBe(isProduction);
    expect(reader.isTest).toBe(isTest);
  });
});
