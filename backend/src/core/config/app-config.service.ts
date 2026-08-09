import { Inject, Injectable } from '@nestjs/common';
// `import type`: a type in a decorated signature cannot be a value import while
// isolatedModules and emitDecoratorMetadata are both on.
import type { ConfigType } from '@nestjs/config';
import { appConfig, LogLevelName, NodeEnv } from './configuration';

/**
 * Typed reader for the environment.
 *
 * Providers inject this rather than `ConfigService`, so a setting is a property
 * with a type instead of a string key, and a spec can hand over a plain object
 * in place of the whole config module.
 */
@Injectable()
export class AppConfigService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  get nodeEnv(): NodeEnv {
    return this.config.nodeEnv;
  }

  get port(): number {
    return this.config.port;
  }

  get logLevel(): LogLevelName {
    return this.config.logLevel;
  }

  get docsEnabled(): boolean {
    return this.config.docsEnabled;
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  get isTest(): boolean {
    return this.nodeEnv === NodeEnv.Test;
  }
}
