import { createElement, useId, useMemo, useState, type ReactNode } from 'react';
import type { Token } from 'markdown-it';
import {
  ArrowRight, BookOpen, Bookmark, Calendar, Check, CircleHelp, Clock, Ear, Globe, GraduationCap, Info,
  Lightbulb, ListChecks, MessageCircle, Pencil, Repeat, Sparkles, Target, TriangleAlert, X, type LucideIcon,
} from 'lucide-react';
import type { CHATMD_ICONS } from '@app/shared';
import { parseChatMD, parseInline, parseLessonBody, type LessonBlock } from './parseChatMD';
import './chatmd.css';

const TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em']);
const CALLOUT_LABELS = { tip: 'Подсказка', note: 'Примечание', example: 'Пример' };

const icons = {
  book: BookOpen, graduation: GraduationCap, lightbulb: Lightbulb, info: Info, warning: TriangleAlert,
  question: CircleHelp, check: Check, cross: X, chat: MessageCircle, clock: Clock, calendar: Calendar,
  pencil: Pencil, list: ListChecks, bookmark: Bookmark, target: Target, sparkles: Sparkles, ear: Ear,
  globe: Globe, repeat: Repeat, 'arrow-right': ArrowRight,
} satisfies Record<typeof CHATMD_ICONS[number], LucideIcon>;

function renderTokens(tokens: Token[], preserveBreaks = false): ReactNode[] {
  const root: ReactNode[] = [];
  const frames: { token: Token; children: ReactNode[]; index: number }[] = [];
  tokens.forEach((token, index) => {
    if (token.nesting === 1) {
      frames.push({ token, index, children: [] });
      return;
    }

    if (token.nesting === -1) {
      const frame = frames.pop();
      if (!frame) return;
      const parent = frames.at(-1)?.children ?? root;
      const tag = frame.token.tag;
      if (frame.token.hidden || !TAGS.has(tag)) {
        parent.push(...frame.children);
      } else {
        const start = tag === 'ol' ? frame.token.attrGet('start') : null;
        parent.push(createElement(tag, { key: frame.index, start: start ?? undefined }, frame.children));
      }
      return;
    }

    const parent = frames.at(-1)?.children ?? root;
    switch (token.type) {
      case 'inline':
        parent.push(...renderTokens(token.children ?? [], preserveBreaks));
        break;
      case 'chatmd_icon': {
        const name = token.meta as keyof typeof icons;
        const Icon = Object.hasOwn(icons, name) ? icons[name] : undefined;
        parent.push(Icon ? <Icon key={index} className="chatmd-icon" strokeWidth={1.75} aria-hidden="true" /> : token.content);
        break;
      }
      case 'text':
        parent.push(token.content);
        break;
      case 'softbreak':
        parent.push(preserveBreaks ? <br key={index} /> : '\n');
        break;
      case 'hardbreak':
        parent.push(<br key={index} />);
        break;
      case 'code_inline':
        parent.push(<code key={index}>{token.content}</code>);
        break;
      case 'fence':
      case 'code_block':
        parent.push(<pre key={index}><code>{token.content}</code></pre>);
        break;
      case 'hr':
        parent.push(<hr key={index} />);
        break;
      case 'chatmd':
        parent.push(<StudyBlock key={`${index}:${token.content}`} block={token.meta as LessonBlock} />);
        break;
    }
  });
  return root;
}

function Inline({ source, preserveBreaks = false }: { source: string; preserveBreaks?: boolean }) {
  return renderTokens(parseInline(source), preserveBreaks);
}

function Question({ block }: { block: Extract<LessonBlock, { kind: 'question' }> }) {
  const id = useId();
  const [choice, setChoice] = useState<number | null>(null);
  const selected = choice === null ? null : block.options[choice];

  return (
    <fieldset className="chatmd-question">
      <legend>
        <span className="chatmd-label">Самопроверка</span>
        <span className="chatmd-prompt"><Inline source={block.prompt} preserveBreaks /></span>
      </legend>

      <div className="chatmd-options">
        {block.options.map((option, index) => (
          <label key={option.label} className="chatmd-option">
            <input type="radio" name={id} checked={choice === index} onChange={() => setChoice(index)} />
            <span><Inline source={option.label} /></span>
          </label>
        ))}
      </div>

      <div role="status" className="chatmd-feedback">
        {selected && (
          <>
            <div className="chatmd-verdict">
              {selected.correct
                ? <Check size={18} className="text-positive" aria-hidden="true" />
                : <X size={18} className="text-negative" aria-hidden="true" />}
              {selected.correct ? 'Верно' : 'Неверно'}
            </div>
            <div><Inline source={selected.feedback} /></div>
          </>
        )}
      </div>
    </fieldset>
  );
}

function StudyBlock({ block }: { block: LessonBlock }) {
  switch (block.kind) {
    case 'literal':
      return <p className="chatmd-literal">{block.source}</p>;
    case 'question':
      return <Question block={block} />;
    case 'patterns':
      return (
        <dl className="chatmd-patterns">
          {block.rows.map(({ form, explanation, example, translation }, index) => (
            <div className="chatmd-pattern" key={index}>
              <dt><Inline source={form} /></dt>
              <dd>
                <div className="chatmd-pattern-explanation"><Inline source={explanation} /></div>
                <div lang="en"><Inline source={example} /></div>
                <div className="chatmd-pattern-translation"><Inline source={translation} /></div>
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'compare':
      return (
        <div className="chatmd-compare">
          <div>
            <div className="chatmd-label">{block.correction ? 'Неверно' : 'Вариант 1'}</div>
            <Inline source={block.left} />
          </div>
          <div>
            <div className="chatmd-label">{block.correction ? 'Верно' : 'Вариант 2'}</div>
            <Inline source={block.right} />
          </div>
        </div>
      );
    default:
      return (
        <div className="chatmd-callout">
          <div className="chatmd-label">{CALLOUT_LABELS[block.kind]}</div>
          {renderTokens(parseLessonBody(block.body))}
        </div>
      );
  }
}

/** Display the supported Markdown subset and local-only study interactions. */
export function ChatMD({ source }: { source: string }) {
  const content = useMemo(() => renderTokens(parseChatMD(source)), [source]);
  return <div className="chatmd">{content}</div>;
}
