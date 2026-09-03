import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserRow } from './repository.js';

vi.mock('./repository.js', () => ({
  findUserByProviderIdentity: vi.fn(),
  createUserWithIdentity: vi.fn(),
  touchLastLogin: vi.fn(),
}));

const repo = await import('./repository.js');
const { findOrCreateUserFromProvider } = await import('./service.js');

function fakeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'person@example.com',
    display_name: 'Person',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    last_login_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

const profile = {
  provider: 'google',
  providerUserId: 'google-sub-123',
  email: 'person@example.com',
  displayName: 'Person',
  providerEmail: 'person@example.com',
};

beforeEach(() => {
  vi.mocked(repo.findUserByProviderIdentity).mockReset();
  vi.mocked(repo.createUserWithIdentity).mockReset();
  vi.mocked(repo.touchLastLogin).mockReset();
});

describe('findOrCreateUserFromProvider', () => {
  it('creates a new user from a provider identity when none exists', async () => {
    vi.mocked(repo.findUserByProviderIdentity).mockResolvedValue(null);
    const created = fakeUser();
    vi.mocked(repo.createUserWithIdentity).mockResolvedValue(created);

    const result = await findOrCreateUserFromProvider(profile);

    expect(repo.createUserWithIdentity).toHaveBeenCalledWith({
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.providerEmail,
    });
    expect(result).toEqual(created);
  });

  it('logs in an existing provider identity without creating a new user', async () => {
    const existing = fakeUser({ last_login_at: new Date('2024-01-01T00:00:00Z') });
    vi.mocked(repo.findUserByProviderIdentity).mockResolvedValue(existing);
    const newLoginTime = new Date('2024-06-01T00:00:00Z');
    vi.mocked(repo.touchLastLogin).mockResolvedValue(newLoginTime);

    const result = await findOrCreateUserFromProvider(profile);

    expect(repo.createUserWithIdentity).not.toHaveBeenCalled();
    expect(repo.touchLastLogin).toHaveBeenCalledWith(existing.id);
    expect(result).toEqual({ ...existing, last_login_at: newLoginTime });
  });

  it('resolves to the winning row instead of failing on a duplicate identity race', async () => {
    // First lookup finds nothing, so we try to create — but another request
    // for the same (provider, providerUserId) won the race and inserted
    // first, so our insert hits the unique constraint.
    const winner = fakeUser({ id: 'user-2' });
    vi.mocked(repo.findUserByProviderIdentity)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    vi.mocked(repo.createUserWithIdentity).mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    );
    vi.mocked(repo.touchLastLogin).mockResolvedValue(winner.last_login_at);

    const result = await findOrCreateUserFromProvider(profile);

    expect(result).toEqual(winner);
    expect(repo.findUserByProviderIdentity).toHaveBeenCalledTimes(2);
  });

  it('does not swallow unrelated database errors', async () => {
    vi.mocked(repo.findUserByProviderIdentity).mockResolvedValue(null);
    vi.mocked(repo.createUserWithIdentity).mockRejectedValue(new Error('connection reset'));

    await expect(findOrCreateUserFromProvider(profile)).rejects.toThrow('connection reset');
  });
});
