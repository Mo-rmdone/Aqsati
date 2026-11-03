const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
    },
  },
}));

import { changePassword } from '../password';

beforeEach(() => {
  jest.resetAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
});

describe('changePassword', () => {
  it('re-authenticates with the current password then updates', async () => {
    expect(await changePassword('a@b.com', 'oldpass', 'newpass1')).toBe('ok');
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'oldpass' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass1' });
  });

  it('same password makes no calls', async () => {
    expect(await changePassword('a@b.com', 'samepass', 'samepass')).toBe('same');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('short new password is weak and makes no calls', async () => {
    expect(await changePassword('a@b.com', 'oldpass', '12345')).toBe('weak');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('wrong current password stops before updateUser', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    expect(await changePassword('a@b.com', 'wrong', 'newpass1')).toBe('wrong_current');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('server weak_password maps to weak', async () => {
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'Password is too weak' } });
    expect(await changePassword('a@b.com', 'oldpass', 'newpass1')).toBe('weak');
  });

  it('other update errors are failed', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'boom' } });
    expect(await changePassword('a@b.com', 'oldpass', 'newpass1')).toBe('failed');
  });

  it('a thrown error is failed', async () => {
    mockUpdateUser.mockRejectedValue(new Error('network'));
    expect(await changePassword('a@b.com', 'oldpass', 'newpass1')).toBe('failed');
  });
});
