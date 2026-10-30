import { randomUUID } from 'expo-crypto';

/** Client-generated UUID, used as the idempotency key for write RPCs. */
export function newId(): string {
  return randomUUID();
}
