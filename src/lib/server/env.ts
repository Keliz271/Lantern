import { env } from '$env/dynamic/private';

export const readPrivateEnv = (key: string, legacyKey?: string) =>
  env[key] ?? (legacyKey ? env[legacyKey] : undefined);
