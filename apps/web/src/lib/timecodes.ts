import { authHeaders } from './auth';
import { apiUrl, getJson, postJson } from './collections';

export interface Timecode {
  id: string;
  codeHint: string;
  tariffName: string | null;
  months: number;
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

export async function fetchTimecodes() {
  const { timecodes } = await getJson<{ timecodes: Timecode[] }>('/api/admin/timecodes');
  return timecodes;
}

export async function createTimecode(tariffId: string, months: number, maxUses: number) {
  const { timecode } = await postJson<{ timecode: Timecode & { code: string } }>('/api/admin/timecodes', { tariffId, months, maxUses });
  return timecode;
}

export async function redeemTimecode(code: string): Promise<{ premiumUntil: string; isPremium: true } | { error: string }> {
  const response = await fetch(apiUrl('/api/payments/redeem-timecode'), {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (response.status === 429) return { error: 'rate_limit' };
  return response.json();
}
