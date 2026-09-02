import type { ExercisesGradeResult, ExercisesSubmission, PlacementGradeResult, PlacementTestSubmission } from '@app/shared';

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

export function gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult> {
  return postJson('/api/grade/placement-test', input);
}

export function gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
  return postJson('/api/grade/exercises', input);
}
