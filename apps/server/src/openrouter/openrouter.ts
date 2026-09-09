import OpenAI from 'openai';
import type { ProductionCheckInput, ProductionCheckResult, ProductionCheckVerdict, ProductionJudgeProvider } from '@app/shared';
import type { Env } from '../config/env.js';

const VERDICTS: ProductionCheckVerdict[] = ['chunk_used', 'meaning_only', 'not_conveyed'];

function isVerdict(v: unknown): v is ProductionCheckVerdict {
  return typeof v === 'string' && (VERDICTS as string[]).includes(v);
}

/**
 * OpenRouter's API is OpenAI-chat-completions-compatible — the official
 * `openai` SDK pointed at OpenRouter's base URL is OpenRouter's own
 * recommended integration path, not a bespoke HTTP client.
 */
export class OpenRouterProductionJudgeProvider implements ProductionJudgeProvider {
  name = 'openrouter';

  #env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_MODEL'>;

  constructor(env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_MODEL'>) {
    this.#env = env;
  }

  #client(): OpenAI {
    const apiKey = this.#env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set — required for the openrouter production-judge provider.');
    return new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
  }

  #model(): string {
    return this.#env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  }

  async judgeProduction(input: ProductionCheckInput): Promise<ProductionCheckResult> {
    const client = this.#client();

    const user = [
      `Target chunk: "${input.chunkText}" (${input.chunkTranslation}).`,
      input.chunkExample ? `Example usage: "${input.chunkExample}"` : '',
      `Situation given to the learner: "${input.situationPrompt}"`,
      `Learner's free-text answer: """${input.userAnswer || '(no answer)'}"""`,
      '',
      'Judge whether the answer naturally produced the target chunk ITSELF (verbatim or a clear inflected/paraphrased form of the exact same expression) — not just whether the answer conveyed the same meaning some other way.',
    ].join('\n');

    const response = await client.chat.completions.create({
      model: this.#model(),
      // Generous headroom: reasoning-capable models (e.g. the gpt-5 family)
      // spend part of this budget on internal reasoning tokens before ever
      // emitting the tool call, so a tight limit here can cut them off with
      // finish_reason "length" and no tool_calls at all.
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content:
            'You are judging whether a Russian-speaking English learner actively produced a specific target chunk/collocation in their free-text answer to a situational prompt, versus only conveying the meaning some other way, versus not conveying it at all. Always respond only via the provided tool.',
        },
        { role: 'user', content: user },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_production_verdict',
            description: 'Submit the judged verdict for whether the target chunk was actively produced.',
            parameters: {
              type: 'object',
              properties: {
                verdict: {
                  type: 'string',
                  enum: VERDICTS,
                  description:
                    'chunk_used: the answer used the target chunk itself. meaning_only: the meaning was conveyed but not via the target chunk. not_conveyed: the answer did not convey the situation correctly at all.',
                },
                feedback: { type: 'string', description: 'One short sentence in Russian, the single most useful piece of feedback.' },
              },
              required: ['verdict', 'feedback'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_production_verdict' } },
    });

    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      const choice = response.choices[0];
      throw new Error(
        `OpenRouter response did not include the expected tool call ` +
          `(model=${this.#model()}, finish_reason=${choice?.finish_reason ?? 'unknown'}, ` +
          `hasContent=${Boolean(choice?.message.content)}, refusal=${Boolean((choice?.message as { refusal?: unknown } | undefined)?.refusal)}).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error('OpenRouter tool call arguments were not valid JSON.');
    }

    const { verdict, feedback } = parsed as { verdict?: unknown; feedback?: unknown };
    if (!isVerdict(verdict) || typeof feedback !== 'string') {
      throw new Error('OpenRouter tool call returned an unexpected shape.');
    }

    return { verdict, feedback };
  }
}
