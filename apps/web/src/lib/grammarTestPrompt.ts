import { grammarTestDraftSchema } from '@app/shared';

export function buildGrammarTestPrompt(existingQuestions: string[]): string {
  return [
    'Create one English CEFR placement test for Russian-speaking learners of English.',
    'Write the entire test in English. Give it a short Russian title (up to 120 characters).',
    'Write exactly 8 multiple-choice questions, numbered 1–8, with rising difficulty from A1 to C1. Cover a mix of grammar and vocabulary. Each question needs four different options in A–D order and exactly one unambiguous correct option. The correct field must be A, B, C or D. Keep questions and options under 700 characters each.',
    'Write a short original reading passage (up to 4000 characters) and 2 open questions numbered 9 and 10. Both answers must be supported by the passage.',
    'Give one writing task that can be answered in 5–8 sentences. Keep the reading questions and writing prompt under 700 characters each.',
    'Return only valid JSON in the structure below. The example MCQ is illustrative. Supply all 8 original questions and complete every field.',
    JSON.stringify({
      title: 'Название варианта',
      definition: {
        mcq: [{ n: 1, q: 'I ___ a student.', options: ['am', 'is', 'are', 'be'], correct: 'A' }],
        readingPassage: 'The original passage goes here.',
        readingQuestions: [{ n: 9, q: 'First question?' }, { n: 10, q: 'Second question?' }],
        essayPrompt: 'The writing task goes here.',
      },
    }, null, 2),
    ...(existingQuestions.length ? ['Avoid reusing these existing questions:', JSON.stringify(existingQuestions)] : []),
  ].join('\n\n');
}

export function parseGrammarTestDraft(text: string) {
  const input = text.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(input);
  let json: unknown;
  try {
    json = JSON.parse(fenced?.[1] ?? input);
  } catch {
    return { ok: false, message: 'Не удалось прочитать JSON. Скопируйте JSON целиком из ответа.' } as const;
  }

  const result = grammarTestDraftSchema.safeParse(json);
  if (result.success) return { ok: true, draft: result.data } as const;

  const issue = result.error.issues[0];
  const field = issue.path.join('.');
  const details = issue.code === 'custom' ? issue.message : 'Сверьте формат и длину с инструкцией.';
  return { ok: false, message: field ? `Проверьте поле «${field}». ${details}` : 'Ожидается JSON-объект с названием и заданиями.' } as const;
}
