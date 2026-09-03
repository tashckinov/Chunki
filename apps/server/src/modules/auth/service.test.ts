import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserRow } from '../users/repository.js';

vi.mock('../users/service.js', () => ({
  findOrCreateUserFromProvider: vi.fn(),
}));
vi.mock('./session.js', () => ({
  createSession: vi.fn(),
}));

const usersService = await import('../users/service.js');
const session = await import('./session.js');
const { completeGoogleLogin } = await import('./service.js');

const user: UserRow = {
  id: 'user-1',
  email: 'person@example.com',
  display_name: 'Person',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: new Date(),
};

beforeEach(() => {
  vi.mocked(usersService.findOrCreateUserFromProvider).mockReset().mockResolvedValue(user);
  vi.mocked(session.createSession).mockReset().mockResolvedValue({ token: 'tok', expiresAt: new Date() });
});

describe('completeGoogleLogin', () => {
  it('passes the verified Google image URL into the session, never the users table', async () => {
    await completeGoogleLogin({
      providerUserId: 'sub-1',
      email: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
      imageUrl: 'https://lh3.googleusercontent.com/verified-pic',
      nonce: 'n',
    });

    // findOrCreateUserFromProvider only ever receives the fields that map to
    // the `users`/`auth_identities` columns — no imageUrl in sight.
    const passedToUsers = vi.mocked(usersService.findOrCreateUserFromProvider).mock.calls[0][0];
    expect(passedToUsers).not.toHaveProperty('imageUrl');
    expect(passedToUsers).not.toHaveProperty('image_url');

    // The image URL only reaches the (non-users-table) session store.
    expect(session.createSession).toHaveBeenCalledWith(user.id, 'https://lh3.googleusercontent.com/verified-pic');
  });

  it('passes null through when Google did not provide an image', async () => {
    await completeGoogleLogin({
      providerUserId: 'sub-1',
      email: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
      imageUrl: null,
      nonce: 'n',
    });

    expect(session.createSession).toHaveBeenCalledWith(user.id, null);
  });
});
