import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChatMD } from '../src/components/chatmd/parseChatMD.ts';

const blocks = (source) => parseChatMD(source).filter(({ type }) => type === 'chatmd').map(({ meta }) => meta);

test('parses blocks adjacent to ordinary Markdown paragraphs', () => {
  const source = [
    '## Артикли',
    'Используй **a** при первом упоминании.',
    ':::tip', 'Запомни правило.', ':::',
    ':::note', 'Есть исключения.', ':::',
    ':::example', 'I bought a book.', '', 'Я купил книгу.', ':::',
    ':::compare', 'wrong: I bought book.', 'right: I bought a book.', ':::',
    ':::question', 'Ты впервые рассказываешь о книге.', 'I bought ___ book yesterday.',
    '+ a | Книга упоминается впервые.', '- the | Собеседник уже знает, о какой книге речь.', ':::',
    'Следующий абзац.',
  ].join('\n');

  const tokens = parseChatMD(source);
  assert.equal(tokens[0].type, 'heading_open');
  assert.ok(tokens.find(({ children }) => children?.some(({ type }) => type === 'strong_open')));
  const directives = blocks(source);
  assert.deepEqual(directives.map(({ kind }) => kind), ['tip', 'note', 'example', 'compare', 'question']);
  assert.deepEqual(directives.at(-1), {
    kind: 'question',
    prompt: 'Ты впервые рассказываешь о книге.\nI bought ___ book yesterday.',
    options: [
      { label: 'a', correct: true, feedback: 'Книга упоминается впервые.' },
      { label: 'the', correct: false, feedback: 'Собеседник уже знает, о какой книге речь.' },
    ],
  });
  assert.ok(tokens.some(({ content }) => content === 'Следующий абзац.'));
});

test('keeps malformed blocks readable and recovers at the next directive', () => {
  const source = [
    ':::question', 'Выбери ответ.', '+ a | Да.', '+ b | Тоже да.', ':::',
    ':::compare', 'wrong: only one side', ':::',
    ':::note', 'Незакрытое пояснение.',
    ':::tip', 'Следующая подсказка.', ':::',
  ].join('\n');
  const [question, compare, tip] = blocks(source);
  assert.equal(question.kind, 'literal');
  assert.ok(question.source.includes('+ b | Тоже да.'));
  assert.equal(compare.kind, 'literal');
  assert.deepEqual(tip, { kind: 'tip', body: 'Следующая подсказка.' });
  assert.ok(parseChatMD(source).some(({ content }) => content.includes('Незакрытое пояснение.')));
});

test('allows top-level blocks after lists and quotes without a blank line', () => {
  const directive = ':::tip\nПодсказка.\n:::';
  for (const previous of ['- Пункт списка.', '> Цитата.']) {
    assert.deepEqual(blocks(`${previous}\n${directive}`), [{ kind: 'tip', body: 'Подсказка.' }]);
  }
  assert.deepEqual(blocks('> :::tip\n> Текст цитаты.\n> :::'), []);
});

test('accepts escaped separators and rejects duplicates or missing feedback', () => {
  const question = (options) => blocks([':::question', 'Prompt', ...options, ':::'].join('\n'))[0];
  const valid = question([String.raw`+ a \| b | Correct.`, '- c | Incorrect.']);
  assert.equal(valid.options[0].label, String.raw`a \| b`);
  assert.equal(question(['+ a | Yes.', '- a | No.']).kind, 'literal');
  assert.equal(question(['+ a | Yes.', '- b |']).kind, 'literal');
});

test('treats HTML, links and fenced directives as inert content', () => {
  const marker = ':::question\nPrompt\n+ a | yes\n- b | no\n:::';
  const fence = '\x60\x60\x60';
  const text = '<img src=x onerror="alert(1)"> [x](javascript:alert(1)) ![x](https://example.test)';
  const tokens = parseChatMD(`${text}\n\n${fence}\n${marker}\n${fence}\n`);
  assert.deepEqual(tokens.find(({ type }) => type === 'inline').children.map(({ type }) => type), ['text']);
  assert.equal(tokens.find(({ type }) => type === 'fence').content.trim(), marker);
  assert.ok(tokens.every(({ type }) => type !== 'chatmd'));
  assert.deepEqual(blocks(`:::note\n${fence}\n${marker}\n${fence}\n:::`).map(({ kind }) => kind), ['note']);
});

test('parses pattern rows with inline Markdown and escaped pipes', () => {
  const rules = [
    ':::patterns',
    '**a** | Один из многих? | I need a taxi. | Любое такси.',
    '— | В целом? | I like coffee. | Кофе \\| чай.',
    ':::',
  ].join('\n');
  assert.deepEqual(blocks(rules), [{
    kind: 'patterns',
    rows: [
      { form: '**a**', explanation: 'Один из многих?', example: 'I need a taxi.', translation: 'Любое такси.' },
      { form: '—', explanation: 'В целом?', example: 'I like coffee.', translation: 'Кофе \\| чай.' },
    ],
  }]);
});

test('recovers from malformed pattern rows without affecting the next block', () => {
  const valid = 'a | Форма | A taxi. | Такси.';
  for (const invalid of ['the | Форма | The taxi.', 'the |  | The taxi. | Такси.', 'the | Форма | The taxi. | Такси. | Лишнее']) {
    const source = [':::patterns', valid, invalid, ':::', ':::note', 'Пояснение.', ':::'].join('\n');
    assert.deepEqual(blocks(source).map(({ kind }) => kind), ['literal', 'note']);
  }
});
