import { useRef } from 'react';

import { idForAttempt } from '../api/sales';
import { newId } from './ids';

export interface Attempt {
  /** Id for this submit: unchanged for a pure retry (same signature), fresh once inputs changed. */
  idFor(sig: string): string;
  /** Call after a successful mutation so the next submit, even with identical inputs, gets a new id. */
  reset(): void;
}

/** Idempotency-id bookkeeping for one form. */
export function createAttempt(gen: () => string = newId): Attempt {
  let state: { id: string; sig: string | null } = { id: gen(), sig: null };
  return {
    idFor(sig) {
      state = idForAttempt(state, sig, gen);
      return state.id;
    },
    reset() {
      state = { id: gen(), sig: null };
    },
  };
}

export function useAttempt(): Attempt {
  const ref = useRef<Attempt | null>(null);
  if (!ref.current) ref.current = createAttempt();
  return ref.current;
}
