import { MockGradingProvider } from '@app/shared';
import type { ExercisesGradeResult, ExercisesSubmission, PlacementGradeResult, PlacementTestSubmission } from '@app/shared';

// Static demo build (e.g. GitHub Pages) has no backend to call — grade locally
// with the same deterministic mock provider the dev server uses, so the app
// stays fully clickable. Set at build time, see vite.config.ts / build:pages.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_LATENCY_MS = 900;

const demoProvider = new MockGradingProvider();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TResponse>;
}

export async function gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult> {
  if (DEMO_MODE) {
    await wait(DEMO_LATENCY_MS);
    return demoProvider.gradePlacementTest(input);
  }
  return postJson('/api/grade/placement-test', input);
}

export async function gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
  if (DEMO_MODE) {
    await wait(DEMO_LATENCY_MS);
    return demoProvider.gradeExercises(input);
  }
  return postJson('/api/grade/exercises', input);
}
