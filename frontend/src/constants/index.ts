/**
 * Frontend application constants.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const AUTH_STORAGE_KEYS = {
  accessToken: 'rm.accessToken',
  refreshToken: 'rm.refreshToken',
  user: 'rm.user',
} as const;