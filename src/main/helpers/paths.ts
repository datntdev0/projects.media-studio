import { app } from 'electron';
import path from 'node:path';

/**
 * Portable-style storage root: the directory next to wherever the app is
 * actually running from (the executable's directory once packaged, the
 * project root in dev) rather than the OS-specific per-user profile
 * directory (`app.getPath('userData')`). Subsystems (db, logs, ...) each
 * get their own folder under this root.
 */
export function getAppBaseDir(): string {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
}
