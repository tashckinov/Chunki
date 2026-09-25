import type { McqQuestion, ReadingQuestion } from './types.js';

export const MCQ: McqQuestion[] = [
  { n: 1, q: 'I ___ here since 2022.', options: ['work', 'have worked', 'am working', 'worked'], correct: 'B' },
  { n: 2, q: "If I ___ more money, I'd travel more often.", options: ['have', 'had', 'would have', 'will have'], correct: 'B' },
  { n: 3, q: 'I was tired, ___ I decided to go home early.', options: ['although', 'because', 'so', 'however'], correct: 'C' },
  { n: 4, q: 'She asked me where ___.', options: ['did I live', 'I lived', 'do I live', 'I do live'], correct: 'B' },
  { n: 5, q: "I've never ___ to Canada.", options: ['been', 'gone', 'went', 'being'], correct: 'A' },
  {
    n: 6,
    q: 'Which sounds most natural?',
    options: ['I very like this movie.', 'I like very much this movie.', 'I really like this movie.', 'I much like this movie.'],
    correct: 'C',
  },
  { n: 7, q: 'By the time I arrived, they ___ dinner.', options: ['finished', 'have finished', 'had finished', 'were finish'], correct: 'C' },
  {
    n: 8,
    q: 'What does "I ended up staying there" mean?',
    options: [
      'I planned to stay there.',
      "Eventually, I stayed there, although that wasn't necessarily the original plan.",
      'I stopped staying there.',
      'I was forced to leave.',
    ],
    correct: 'B',
  },
];

export const READING_PASSAGE =
  'Daniel had been planning to move abroad for several years, but he kept putting it off ' +
  'because he was worried about finding a job. Eventually, he decided to apply for a few ' +
  'positions just to see what would happen. To his surprise, a company in Dublin offered ' +
  'him a job. Although he was nervous about leaving his friends and family, he accepted the ' +
  'offer. Six months later, he says the move was one of the best decisions he has ever made.';

export const READING_QUESTIONS: ReadingQuestion[] = [
  { n: 9, q: "Why hadn't Daniel moved earlier?" },
  { n: 10, q: 'Was Daniel certain he wanted to move when he started applying? Why/why not?' },
];

export const ESSAY_PROMPT =
  'If you could move to another country next year, where would you go and why? What problems do you think you might face?';


