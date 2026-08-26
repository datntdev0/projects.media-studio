import type { Db } from '../client';

export interface SystemCacheItem {
  cacheType: string;
  cacheKey: string;
  cacheDataJson: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SetSystemCacheInput {
  cacheType: string;
  cacheKey: string;
  cacheDataJson: string;
  /** Milliseconds from now until the item expires. */
  ttl: number;
}

interface SystemCacheRow {
  cache_type: string;
  cache_key: string;
  cache_data_json: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

function toSystemCacheItem(row: SystemCacheRow): SystemCacheItem {
  return {
    cacheType: row.cache_type,
    cacheKey: row.cache_key,
    cacheDataJson: row.cache_data_json,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns undefined for a missing row and for one whose TTL has lapsed. */
export function getSystemCacheItem(db: Db, cacheType: string, cacheKey: string): SystemCacheItem | undefined {
  const row = db.prepare('SELECT * FROM system_cache WHERE cache_type = ? AND cache_key = ?').get(cacheType, cacheKey) as
    | SystemCacheRow
    | undefined;
  if (!row || row.expires_at <= Date.now()) {
    return undefined;
  }
  return toSystemCacheItem(row);
}

export function setSystemCacheItem(db: Db, input: SetSystemCacheInput): SystemCacheItem {
  const now = Date.now();
  const expiresAt = now + input.ttl;

  db.prepare(
    `INSERT INTO system_cache (cache_type, cache_key, cache_data_json, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (cache_type, cache_key) DO UPDATE SET cache_data_json = excluded.cache_data_json, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
  ).run(input.cacheType, input.cacheKey, input.cacheDataJson, expiresAt, now, now);

  return getSystemCacheItem(db, input.cacheType, input.cacheKey)!;
}
