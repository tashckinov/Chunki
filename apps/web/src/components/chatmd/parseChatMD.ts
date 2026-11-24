import MarkdownIt, { type StateBlock } from 'markdown-it';

type CalloutKind = 'tip' | 'note' | 'example';

export interface QuestionOption {
  label: string;
  correct: boolean;
  feedback: string;
}

interface PatternRow {
  form: string;
  explanation: string;
  example: string;
  translation: string;
}

interface FormulaRow {
  title: string;
  parts: Array<{ text: string; role?: string }>;
}

export type LessonBlock =
  | { kind: CalloutKind; body: string }
  | { kind: 'compare'; left: string; right: string; correction: boolean }
  | { kind: 'question'; prompt: string; options: QuestionOption[] }
  | { kind: 'patterns'; rows: PatternRow[] }
  | { kind: 'formula'; rows: FormulaRow[] }
  | { kind: 'literal'; source: string };

const OPEN = /^:::(tip|note|compare|example|question|patterns|formula)[ \t]*$/;
const CODE_FENCE = /^(`{3,}|~{3,})(.*)$/;
const OPTION_START = /^[+-][ \t]/;
// Split at the first unescaped pipe. Markdown handles the escape in each field.
const OPTION = /^([+-])[ \t]((?:\\.|[^\\|])+)\|(.+)$/;

function readBlock(kind: string, body: string): LessonBlock | null {
  if (!body.trim()) return null;

  if (kind === 'tip' || kind === 'note' || kind === 'example') return { kind, body };

  const lines = body.split('\n').map((line) => line.trim());
  if (kind === 'formula') {
    const rows: FormulaRow[] = [];
    for (const pair of body.trim().split(/\n(?:[ \t]*\n)+/)) {
      const [title, expression, ...extra] = pair.split('\n').map((line) => line.trim());
      if (!title || !expression || extra.length) return null;
      const parts: FormulaRow['parts'] = [];
      let cursor = 0;
      for (const match of expression.matchAll(/\[([\p{L}][\p{L}\p{N}_-]*):([^\[\]]+)\]/gu)) {
        const text = match[2].trim();
        if (!text) continue;
        if (match.index > cursor) parts.push({ text: expression.slice(cursor, match.index) });
        parts.push({ role: match[1], text });
        cursor = match.index + match[0].length;
      }
      if (cursor < expression.length) parts.push({ text: expression.slice(cursor) });
      rows.push({ title, parts });
    }
    return { kind: 'formula', rows };
  }

  if (kind === 'compare') {
    const entries = lines.filter(Boolean);
    if (entries.length !== 2) return null;
    const left = /^(wrong|left):[ \t]*(\S.*)$/.exec(entries[0]);
    const right = /^right:[ \t]*(\S.*)$/.exec(entries[1]);
    return left && right ? { kind: 'compare', left: left[2], right: right[1], correction: left[1] === 'wrong' } : null;
  }

  if (kind === 'patterns') {
    const rows: PatternRow[] = [];
    const row = /^((?:\\.|[^\\|])+)\|((?:\\.|[^\\|])+)\|((?:\\.|[^\\|])+)\|((?:\\.|[^\\|])+)$/;
    for (const line of lines.filter(Boolean)) {
      const match = row.exec(line);
      if (!match) return null;
      const [form, explanation, example, translation] = match.slice(1).map((field) => field.trim());
      if (!form || !explanation || !example || !translation) return null;
      rows.push({ form, explanation, example, translation });
    }
    return rows.length >= 2 ? { kind: 'patterns', rows } : null;
  }

  const firstOption = lines.findIndex((line) => OPTION_START.test(line));
  if (firstOption < 1) return null;
  const prompt = lines.slice(0, firstOption).join('\n').trim();
  if (!prompt) return null;

  const options: QuestionOption[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(firstOption).filter(Boolean)) {
    const match = OPTION.exec(line);
    if (!match) return null;
    const [, sign, rawLabel, rawFeedback] = match;
    const label = rawLabel.trim();
    const feedback = rawFeedback.trim();
    if (!label || !feedback || seen.has(label)) return null;
    seen.add(label);
    options.push({ label, correct: sign === '+', feedback });
  }
  if (options.length < 2 || options.filter((option) => option.correct).length !== 1) return null;
  return { kind: 'question', prompt, options };
}

function directive(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  const indent = state.sCount[start];
  if (!state.env?.chatMD || indent < 0 || indent >= 4) return false;
  // A top-level marker may end a list's lazy continuation, but cannot open
  // a lesson block within a list item or quote.
  if (state.level !== 0 && (!silent || indent >= state.blkIndent)) return false;

  const lineAt = (line: number) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
  const kind = OPEN.exec(lineAt(start))?.[1];
  if (!kind) return false;

  let fence: string | undefined;
  for (let line = start + 1; line < end; line++) {
    if (state.sCount[line] >= 4) continue;
    const marker = lineAt(line).trimEnd();
    const codeFence = CODE_FENCE.exec(marker);
    if (fence) {
      if (codeFence && codeFence[1][0] === fence[0] && codeFence[1].length >= fence.length && !codeFence[2]) fence = undefined;
      continue;
    }
    if (codeFence && (codeFence[1][0] === '~' || !codeFence[2].includes('`'))) {
      fence = codeFence[1];
      continue;
    }
    if (marker === ':::') {
      if (silent) return true;

      const body = state.getLines(start + 1, line, 0, false);
      const source = state.getLines(start, line + 1, 0, false);
      const token = state.push('chatmd', '', 0);
      token.meta = readBlock(kind, body) ?? { kind: 'literal', source };
      token.content = source;
      state.line = line + 1;
      return true;
    }
    // A new directive is a recovery point for an unclosed block.
    if (marker.startsWith(':::')) return false;
  }
  return false;
}

const markdown = new MarkdownIt('commonmark', { html: false });
markdown.disable(['link', 'image', 'autolink', 'reference']);
markdown.block.ruler.before('fence', 'chatmd', directive, { alt: ['paragraph', 'blockquote'] });

markdown.inline.ruler.before('link', 'chatmd_icon', (state, silent) => {
  if (state.src[state.pos] !== '[') return false;
  const match = /^\[icon:([a-z][a-z-]{0,31})\]/.exec(state.src.slice(state.pos, state.posMax));
  if (!match) return false;
  if (!silent) {
    const token = state.push('chatmd_icon', '', 0);
    token.content = match[0];
    token.meta = { name: match[1] };
  }
  state.pos += match[0].length;
  return true;
});

export const parseChatMD = (source: string) => markdown.parse(source, { chatMD: true });
export const parseLessonBody = (source: string) => markdown.parse(source, {});
export const parseInline = (source: string) => markdown.parseInline(source, {});
