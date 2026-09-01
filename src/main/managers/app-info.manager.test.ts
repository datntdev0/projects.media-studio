import { beforeEach, describe, expect, it } from 'vitest';
import { createAppInfoManager } from './app-info.manager';
import { createTestDb } from '@/main/database/test-db';
import type { Db } from '@/main/database/client';

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

describe('app info manager', () => {
  it('get() returns undefined before init() has ever run', () => {
    const manager = createAppInfoManager(db);
    expect(manager.get()).toBeUndefined();
  });

  it('init() persists the app name/version and a freshly generated install id', () => {
    const manager = createAppInfoManager(db);
    const info = manager.init();

    expect(info.appName).toBe('media-studio');
    expect(info.appVersion).toBe('0.1.0');
    expect(info.installId).toBeTruthy();
    expect(manager.get()).toEqual(info);
  });

  it('init() reuses the same install id and createdAt across repeated calls', () => {
    const manager = createAppInfoManager(db);
    const first = manager.init();
    const second = manager.init();

    expect(second.installId).toBe(first.installId);
    expect(second.createdAt).toBe(first.createdAt);
  });
});
