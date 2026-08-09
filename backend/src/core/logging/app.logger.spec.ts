import { AppConfigService } from '../config/app-config.service';
import { LogLevelName, NodeEnv } from '../config/configuration';
import { AppLogger, enabledLevels } from './app.logger';
import { requestContext } from './request-context';

/**
 * Reaches the two protected hooks the logger overrides. Casting is the price of
 * testing an extension point the base class keeps protected.
 */
interface LoggerInternals {
  getJsonLogObject(
    message: unknown,
    options: { context: string; logLevel: 'log' },
  ): Record<string, unknown>;
  formatContext(context: string): string;
}

function loggerFor(nodeEnv: NodeEnv): AppLogger & LoggerInternals {
  const config = {
    nodeEnv,
    logLevel: 'log',
    isProduction: nodeEnv === NodeEnv.Production,
    isTest: nodeEnv === NodeEnv.Test,
  } as AppConfigService;

  return new AppLogger(config) as AppLogger & LoggerInternals;
}

const asJson = (logger: AppLogger & LoggerInternals) =>
  logger.getJsonLogObject('served', { context: 'Http', logLevel: 'log' });

describe('enabledLevels', () => {
  it('enables the given level and everything more severe', () => {
    expect(enabledLevels('warn')).toEqual(['warn', 'error', 'fatal']);
  });

  it('enables everything at the most verbose level', () => {
    expect(enabledLevels('verbose')).toHaveLength(6);
  });

  it('enables only fatal at the least verbose level', () => {
    expect(enabledLevels('fatal')).toEqual(['fatal']);
  });

  it('treats an unrecognised level as the default rather than silence', () => {
    // LOG_LEVEL is not validated, and a typo that muted the service would be
    // indistinguishable from a service that had stopped logging.
    expect(enabledLevels('chatty' as LogLevelName)).toEqual(
      enabledLevels('log'),
    );
  });
});

describe('AppLogger', () => {
  describe('JSON output', () => {
    it('carries the whole request id, for machines to match on', () => {
      const logger = loggerFor(NodeEnv.Production);

      const entry = requestContext.run({ requestId: 'a'.repeat(36) }, () =>
        asJson(logger),
      );

      expect(entry.requestId).toBe('a'.repeat(36));
    });

    it('keeps the fields the base logger emits', () => {
      const entry = requestContext.run({ requestId: 'probe-123' }, () =>
        asJson(loggerFor(NodeEnv.Production)),
      );

      expect(entry).toMatchObject({
        level: 'log',
        message: 'served',
        context: 'Http',
      });
      expect(entry.pid).toEqual(expect.any(Number));
    });

    it('omits the request id outside a request', () => {
      expect(asJson(loggerFor(NodeEnv.Production))).not.toHaveProperty(
        'requestId',
      );
    });
  });

  describe('console output', () => {
    it('shortens a generated uuid to keep the line readable', () => {
      const logger = loggerFor(NodeEnv.Development);

      const context = requestContext.run(
        { requestId: '6982c1bc-8132-46bd-ac95-4719a45d3ade' },
        () => logger.formatContext('Http'),
      );

      expect(context).toContain('6982c1bc');
      expect(context).not.toContain('4719a45d3ade');
    });

    it('leaves a caller-supplied id whole', () => {
      // Clipping it would print an id the caller never sent.
      const logger = loggerFor(NodeEnv.Development);

      const context = requestContext.run({ requestId: 'probe-123' }, () =>
        logger.formatContext('Http'),
      );

      expect(context).toContain('probe-123');
    });

    it('falls back to the plain context outside a request', () => {
      const context = loggerFor(NodeEnv.Development).formatContext('Bootstrap');

      expect(context).toContain('Bootstrap');
    });
  });
});
