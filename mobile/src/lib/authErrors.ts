const GENERIC = 'حصلت مشكلة، حاول مرة تانية';

const MAP: { code: string; re: RegExp; ar: string }[] = [
  { code: 'user_already_exists', re: /already (been )?registered|already exists/i, ar: 'الإيميل ده مسجل قبل كده' },
  { code: 'email_exists', re: /email.*(exists|registered)/i, ar: 'الإيميل ده مسجل قبل كده' },
  { code: 'invalid_credentials', re: /invalid (login )?credentials/i, ar: 'الإيميل أو كلمة المرور غلط' },
  { code: 'email_not_confirmed', re: /email not confirmed/i, ar: 'لازم تأكد الإيميل الأول من الرسالة اللي وصلتك' },
  { code: 'weak_password', re: /password.*(weak|short|at least|characters)|weak password/i, ar: 'كلمة المرور ضعيفة' },
];

/** Maps a Supabase auth / RPC error to an Arabic message. Arabic server messages pass through. */
export function authErrorMessage(e: unknown): string {
  if (!e) return GENERIC;
  const { code, message } = e as { code?: string; message?: string };
  for (const m of MAP) {
    if ((code && code === m.code) || (message && m.re.test(message))) return m.ar;
  }
  if (message && /[؀-ۿ]/.test(message)) return message;
  return GENERIC;
}
