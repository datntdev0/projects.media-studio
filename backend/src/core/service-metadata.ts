import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageManifest {
  name?: string;
  version?: string;
}

/**
 * The service's own name and version, read from its manifest.
 *
 * `src/` and `dist/` sit at the same depth under the package root, so one
 * relative path serves both `nest start` and the compiled build. Read once, at
 * import; a manifest that cannot be read falls back rather than failing boot,
 * because reporting a version is never worth refusing to serve over.
 */
function readManifest(): PackageManifest {
  try {
    const path = join(__dirname, '..', '..', 'package.json');

    return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
  } catch {
    return {};
  }
}

const manifest = readManifest();

export const SERVICE_NAME = manifest.name ?? '@media-studio/backend';

export const SERVICE_VERSION = manifest.version ?? '0.0.0';
