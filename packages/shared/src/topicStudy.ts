import { z } from 'zod';
import type { CurriculumTopic, TopicIdentity } from './types.js';

export const CHATMD_ICONS = [
  'book', 'graduation', 'lightbulb', 'info', 'warning', 'question', 'check', 'cross', 'chat', 'clock',
  'calendar', 'pencil', 'list', 'bookmark', 'target', 'sparkles', 'ear', 'globe', 'repeat', 'arrow-right',
] as const;

const studyLine = z.string().trim().min(1).max(1000);

export const topicStudySchema = z.object({
  explanation: z.string().trim().min(1).max(16000),
  keyPoints: z.array(studyLine).max(5),
  contrastExamples: z.array(z.object({ wrong: studyLine, right: studyLine }).strict()).max(4),
  exampleChunks: z.array(studyLine).max(5),
}).strict();

export const TOPIC_ENGLISH_INSTRUCTION = 'English is the target language. The learner speaks Russian and is learning English. Teach English words and constructions even when the topic title and objective are written in Russian. Write the target examples, practice options and expected answers in English. Use Russian for explanations, feedback and optional translations. Never ask the learner to produce Russian.';

export function topicScope(topic: TopicIdentity, curriculum?: CurriculumTopic): string {
  if (!curriculum) return `Topic: "${topic.title}" (${topic.category}). CEFR: ${topic.level ?? 'unspecified'}.`;
  const { id, title, category, level, objective, subtopics } = curriculum;
  return [
    `Fixed curriculum scope: ${JSON.stringify({ id, title, category, level, objective, subtopics })}`,
    'Teach or practise this objective at this exact CEFR level. Use only the listed subtopics when present. Choose your own examples, but do not introduce a separate objective, topic or level.',
  ].join('\n');
}

export function topicStudyInstructions(topic: TopicIdentity, curriculum?: CurriculumTopic): string {
  return [
    TOPIC_ENGLISH_INSTRUCTION,
    topicScope(topic, curriculum),
    'Introduce English forms first, then optionally give a Russian gloss (e.g. **bread** — хлеб). Use neutral examples suitable for the topic level.',
    'Use Markdown in explanation, without HTML. Optional ChatMD blocks use :::tip (rule), :::note (clarification), :::example (example with translation or explanation), :::compare (two lines: wrong: … and right: …), or :::question. Put each marker on its own line and close with :::. Do not nest blocks.',
    'Optional :::patterns compares related forms when learners need to choose between them. Use at least two rows, one per form: form | short Russian usage cue | English example | Russian translation or note. Close with :::. Use it only when the comparison clarifies the lesson.',
    'Optional inline icons use [icon:name], for example [icon:lightbulb] Подсказка. Use icons sparingly next to descriptive text. Names: ' + CHATMD_ICONS.join(', ') + '.',
    'Use blocks only when useful. Usually 1–2 questions near the relevant rule suffice. Each needs a prompt, exactly one + option, at least one - option, and specific Russian feedback for every option:',
    ':::question\n[Question about this objective]\n+ [Correct option] | [Why it works]\n- [Distractor] | [Why it does not work]\n:::',
    'Use keyPoints for additional rules in Russian (up to 5), contrastExamples for English mistake/correction pairs (up to 4), and exampleChunks for English phrases (up to 5). Use empty arrays when there is nothing to add.',
  ].join('\n');
}
