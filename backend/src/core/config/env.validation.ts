import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Nest's log levels, least to most severe. Enabling one enables everything above it. */
export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

/**
 * Read a boolean out of an environment string.
 *
 * Not `Type(() => Boolean)`: `Boolean('false')` is `true`, so the obvious
 * spelling silently turns every falsy-looking value on. Anything unrecognised
 * is passed through untouched for `@IsBoolean` to reject by name.
 */
function toBoolean(value: unknown, fallback: boolean): unknown {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  // An environment only ever hands over strings; anything else is a caller's
  // mistake, so hand it to @IsBoolean to name rather than coercing it.
  if (typeof value !== 'string') {
    return value;
  }

  const normalised = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalised)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalised)) {
    return false;
  }

  return value;
}

/**
 * Every environment variable the service reads, and the only place `process.env`
 * is interpreted. Defaults live here too, so a bare `pnpm dev` works and a
 * misconfigured deployment fails at boot rather than on first request.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  // IsIn, not IsEnum: given a plain tuple, IsEnum's failure message cannot list
  // the values it wanted, which makes for a useless boot error.
  @IsIn([...LOG_LEVELS])
  LOG_LEVEL: LogLevelName = 'log';

  /** Serve `/reference` and `/openapi.json`. Off in a hardened deployment. */
  @Transform(({ value }) => toBoolean(value, true))
  @IsBoolean()
  API_DOCS_ENABLED: boolean = true;
}

/**
 * Passed to `ConfigModule.forRoot`. Reports every invalid variable at once —
 * fixing a bad environment one restart at a time is miserable.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const report = errors
      .map((error) => {
        const reasons = Object.values(error.constraints ?? {}).join('; ');
        return `  ${error.property}=${String(error.value)} — ${reasons}`;
      })
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${report}`);
  }

  return parsed;
}
