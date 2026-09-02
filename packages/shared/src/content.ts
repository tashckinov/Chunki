import type {
  ChunkCard,
  ChunkDeckDef,
  ExerciseBlock,
  ExtraTopicDef,
  McqQuestion,
  ProgramTopicDef,
  ReadingQuestion,
} from './types.js';

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

export const EX_BLOCKS: ExerciseBlock[] = [
  {
    key: 'comprehension',
    label: 'Понимание',
    meta: 'ПОНИМАНИЕ · 1 ТЕКСТ · 2 ЗАДАНИЯ',
    text:
      'Since she moved to Dublin, Maria has changed jobs twice. Her first job was in a small café, where she worked for four months before a design studio offered her a junior role. She has been there since March and says she has finally stopped translating everything in her head.',
    items: [
      { type: 'choice', q: 'How long has Maria been at the design studio?', options: ['Four months', 'Since March', 'Twice'], answer: 'Since March' },
      { type: 'write', q: 'Why does the writer use "has changed jobs" and not "changed jobs"? Ответь на английском.', rows: 3, placeholder: 'Your answer' },
    ],
  },
  {
    key: 'grammar',
    label: 'Грамматика',
    meta: 'ГРАММАТИКА · 3 ЗАДАНИЯ',
    items: [
      { type: 'choice', q: 'I ___ this film three times, and I still like it.', options: ['saw', 'have seen', 'had seen'], answer: 'have seen' },
      { type: 'choice', q: 'We ___ to Prague in 2019 and loved it.', options: ['have gone', 'went', 'have been'], answer: 'went' },
      { type: 'choice', q: 'She ___ her keys, so she is waiting outside.', options: ['lost', 'has lost', 'had lost'], answer: 'has lost' },
    ],
  },
  {
    key: 'use-of-english',
    label: 'Use of English',
    meta: 'USE OF ENGLISH · 2 ЗАДАНИЯ',
    items: [
      { type: 'write', q: 'Перепиши естественно: "I am working here since two years."', rows: 2, placeholder: 'Your version' },
      { type: 'choice', q: 'Какой маркер невозможен с Present Perfect?', options: ['ever', 'yesterday', 'so far'], answer: 'yesterday' },
    ],
  },
  {
    key: 'writing',
    label: 'Письмо',
    meta: 'ПИСЬМО · 1 ЗАДАНИЕ',
    items: [
      { type: 'write', q: '3–4 предложения другу: что изменилось в твоей жизни за этот год. Используй Present Perfect хотя бы дважды.', rows: 6, placeholder: 'Your message' },
    ],
  },
];

export const PROGRAM_TOPICS: ProgramTopicDef[] = [
  { id: 'articles', title: 'Артикли: a / the / нулевой', category: 'Грамматика' },
  { id: 'word-order', title: 'Порядок слов и наречия частоты', category: 'Использование языка' },
  { id: 'past-simple', title: 'Past Simple: закрытое время', category: 'Грамматика' },
  { id: 'chunks-past', title: 'Chunks: рассказ о прошлом', category: 'Лексика' },
  { id: 'present-perfect', title: 'Present Perfect vs Past Simple', category: 'Грамматика' },
  { id: 'past-perfect', title: 'Past Perfect и последовательность', category: 'Грамматика' },
  { id: 'conditionals-2', title: 'Второй тип условных', category: 'Грамматика' },
  { id: 'reported-speech', title: 'Reported speech: вопросы', category: 'Использование языка' },
  { id: 'chunks-work', title: 'Chunks: работа и переезд', category: 'Лексика' },
  { id: 'reading-long', title: 'Reading: длинный текст на время', category: 'Понимание' },
  { id: 'writing-informal', title: 'Письмо: неформальное сообщение', category: 'Письмо' },
  { id: 'modals', title: 'Модальные глаголы вероятности', category: 'Грамматика' },
  { id: 'chunks-opinion', title: 'Chunks: мнение и согласие', category: 'Лексика' },
  { id: 'final-check', title: 'Итоговая проверка уровня', category: 'Понимание' },
];

export const EXTRA_TOPIC_DEFS: ExtraTopicDef[] = [
  { key: 'articles', title: 'Артикли: повтор' },
  { key: 'modals', title: 'Модальные глаголы' },
  { key: 'conditionals', title: 'Условные второго типа' },
  { key: 'word-order', title: 'Наречия и порядок слов' },
  { key: 'listening', title: 'Аудирование: короткие диалоги' },
];

export const CARDS: ChunkCard[] = [
  {
    id: 'never-been',
    en: "I've never been to…",
    ru: 'я никогда не был в…',
    ipa: '/aɪv ˈnevə biːn tuː/',
    kind: 'чанк · опыт',
    ex: "I've never been to Canada, but I'd like to go.",
    topic: 'Present Perfect',
    level: 'B1',
    contrast: {
      phrase: "I've never been in…",
      note: '"been to" — для поездки/визита, place как пункт назначения. "been in" звучит неестественно для путешествий — так говорят скорее про нахождение внутри чего-то (in the room, in prison).',
    },
  },
  {
    id: 'by-the-time',
    en: 'by the time I arrived',
    ru: 'к тому моменту, как я приехал',
    ipa: '/baɪ ðə taɪm aɪ əˈraɪvd/',
    kind: 'чанк · время',
    ex: 'By the time I arrived, they had finished dinner.',
    topic: 'Past Perfect',
    level: 'B1+',
    contrast: {
      phrase: 'when I arrived',
      note: '"by the time" подчёркивает, что что-то ДРУГОЕ уже произошло к этому моменту — и почти всегда тянет за собой Past Perfect. "when" просто называет момент, без этого оттенка.',
    },
  },
  {
    id: 'end-up',
    en: 'end up doing sth',
    ru: 'в итоге сделать что-то',
    ipa: '/end ʌp ˈduːɪŋ/',
    kind: 'чанк · результат',
    ex: 'I ended up staying there for a week.',
    topic: 'Chunks: рассказ о прошлом',
    level: 'A2+',
    contrast: {
      phrase: 'finish doing sth',
      note: '"end up" — незапланированный итог, который получился сам собой. "finish" — просто закончить то, что и планировали сделать.',
    },
  },
  {
    id: 'put-off',
    en: 'put sth off',
    ru: 'откладывать',
    ipa: '/pʊt ɪt ɒf/',
    kind: 'фразовый глагол',
    ex: 'He kept putting it off because he was worried.',
    topic: 'Chunks: работа и переезд',
    level: 'B1',
    contrast: {
      phrase: 'cancel sth',
      note: '"put off" — перенести на другое время, дело остаётся в планах. "cancel" — отменить совсем, дела не будет.',
    },
  },
  {
    id: 'so-far',
    en: 'so far',
    ru: 'пока что, до сих пор',
    ipa: '/səʊ fɑː/',
    kind: 'маркер времени',
    ex: 'So far it has gone well.',
    topic: 'Present Perfect',
    level: 'A2+',
    contrast: {
      phrase: 'up to now',
      note: 'Значение то же, но "so far" — разговорный, обычный выбор в речи; "up to now" звучит более официально и чаще встречается на письме.',
    },
  },
  {
    id: 'hang-of',
    en: 'get the hang of',
    ru: 'освоиться',
    ipa: '/ɡet ðə hæŋ ɒv/',
    kind: 'чанк · навык',
    ex: 'It took me a week to get the hang of it.',
    topic: 'Chunks: работа и переезд',
    level: 'B1',
    contrast: {
      phrase: 'get used to sth',
      note: '"get the hang of" — научиться конкретному навыку/приёму. "get used to" — просто привыкнуть к ситуации, это не про умение.',
    },
  },
];

export const CARD_DECKS: ChunkDeckDef[] = [
  { id: 'present-perfect', title: 'Present Perfect', level: 'B1', category: 'Грамматика', cardIds: ['never-been', 'so-far'] },
  { id: 'past-perfect', title: 'Past Perfect', level: 'B1+', category: 'Грамматика', cardIds: ['by-the-time'] },
  { id: 'work-move', title: 'Работа и переезд', level: 'B1', category: 'Лексика', cardIds: ['put-off', 'hang-of'] },
  { id: 'past-story', title: 'Рассказ о прошлом', level: 'A2+', category: 'Лексика', cardIds: ['end-up'] },
];
