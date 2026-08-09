import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, LogLevelName, NodeEnv } from './env.validation';

/**
 * Typed reader for the validated environment.
 *
 * Providers inject this rather than `ConfigService`, so a setting is a property
 * with a type instead of a string key, and a test can supply a plain object in
 * place of the whole config module.
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  get nodeEnv(): NodeEnv {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get logLevel(): LogLevelName {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get docsEnabled(): boolean {
    return this.config.get('API_DOCS_ENABLED', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  get isTest(): boolean {
    return this.nodeEnv === NodeEnv.Test;
  }
}
