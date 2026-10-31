import { authErrorMessage } from '../authErrors';

test('already registered', () => {
  expect(authErrorMessage({ message: 'User already registered' })).toBe('الإيميل ده مسجل قبل كده');
  expect(authErrorMessage({ code: 'user_already_exists', message: 'x' })).toBe('الإيميل ده مسجل قبل كده');
});
test('invalid credentials', () => {
  expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe('الإيميل أو كلمة المرور غلط');
  expect(authErrorMessage({ code: 'invalid_credentials', message: '' })).toBe('الإيميل أو كلمة المرور غلط');
});
test('email not confirmed', () => {
  expect(authErrorMessage({ message: 'Email not confirmed' })).toBe('لازم تأكد الإيميل الأول من الرسالة اللي وصلتك');
});
test('weak password', () => {
  expect(authErrorMessage({ code: 'weak_password', message: 'x' })).toBe('كلمة المرور ضعيفة');
  expect(authErrorMessage({ message: 'Password should be at least 6 characters.' })).toBe('كلمة المرور ضعيفة');
});
test('arabic passes through, unknown falls back', () => {
  expect(authErrorMessage({ message: 'غير مصرح' })).toBe('غير مصرح');
  expect(authErrorMessage({ message: 'Database exploded' })).toBe('حصلت مشكلة، حاول مرة تانية');
  expect(authErrorMessage(null)).toBe('حصلت مشكلة، حاول مرة تانية');
});
