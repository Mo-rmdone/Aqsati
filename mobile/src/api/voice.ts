import { useMutation } from '@tanstack/react-query';

import type { Intent } from '../../../supabase/functions/voice-intent/logic';
import { supabase } from '../lib/supabase';

export type { Intent };

export type VoiceErrorCode = 'budget_exceeded' | 'not_configured' | 'too_long' | 'unavailable' | 'unauthorized';

export class VoiceError extends Error {
  code: VoiceErrorCode;
  constructor(code: VoiceErrorCode) {
    super(code);
    this.name = 'VoiceError';
    this.code = code;
  }
}

const TEXT: Record<VoiceErrorCode, string> = {
  budget_exceeded: 'خلّصت حصة الشهر للمساعد الصوتي',
  not_configured: 'المساعد الصوتي لسه مش متفعّل',
  too_long: 'الكلام طويل، قولها أقصر',
  unavailable: 'المساعد مش متاح دلوقتي، جرّب كمان شوية',
  unauthorized: 'سجّل دخول تاني وجرّب',
};

export function voiceErrorText(code: VoiceErrorCode): string {
  return TEXT[code];
}

async function mapError(error: any): Promise<VoiceError> {
  const res = error?.context;
  if (res && typeof res.status === 'number') {
    if (res.status === 401) return new VoiceError('unauthorized');
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    const code = body && typeof body === 'object' ? body.error : undefined;
    if (code === 'budget_exceeded' || code === 'not_configured' || code === 'too_long') return new VoiceError(code);
  }
  return new VoiceError('unavailable');
}

export function useVoiceIntent() {
  return useMutation({
    mutationFn: async (text: string): Promise<Intent> => {
      const { data, error } = await supabase.functions.invoke('voice-intent', { body: { text } });
      if (error) throw await mapError(error);
      const intent = (data as { intent?: Intent } | null)?.intent;
      if (!intent || typeof intent !== 'object') throw new VoiceError('unavailable');
      return intent;
    },
  });
}
