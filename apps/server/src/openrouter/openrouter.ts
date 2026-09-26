import OpenAI from 'openai';
import type { ProductionCheckInput, ProductionCheckResult, ProductionJudgeProvider } from '@app/shared';
import type { Env } from '../config/env.js';

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

  get model(): string {
    return this.#env.OPENROUTER_MODEL;
  }

  async judgeProduction(input: ProductionCheckInput): Promise<ProductionCheckResult> {
    const client = this.#client();

    const candidateLines = input.candidateChunks.map((c) => `- id "${c.id}": "${c.text}"`).join('\n');
    const user = [
      `Situation given to the learner: "${input.situationPrompt}"`,
      `Learner's free-text answer: """${input.userAnswer || '(no answer)'}"""`,
      '',
      'Known phrases the learner might have used (any one of these, or none):',
      candidateLines,
      '',
      'Judge whether the answer makes sense as a natural reply to the situation, and — separately — whether it actually produced one of the known phrases above (verbatim or a clear inflected/paraphrased form of the exact same expression, common inserted adverbs like "really"/"so"/"just" still count). If the meaning is conveyed some other way, without any of the known phrases, that is still an appropriate answer — just report usedChunkId as null.',
    ].join('\n');

    // A dynamic enum (the exact candidate ids, plus null) rather than a
    // freeform string — constrains the model to either a real id it was
    // actually given or null, so there's nothing to fuzzy-match/typo on
    // the way back out. Still re-validated against candidateChunks by the
    // caller (progress/service.ts) as defense in depth.
    const usedChunkIdEnum: (string | null)[] = [...input.candidateChunks.map((c) => c.id), null];

    const response = await client.chat.completions.create({
      model: this.model,
      // Generous headroom: reasoning-capable models (e.g. the gpt-5 family)
      // spend part of this budget on internal reasoning tokens before ever
      // emitting the tool call, so a tight limit here can cut them off with
      // finish_reason "length" and no tool_calls at all.
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content:
            'You are judging a Russian-speaking English learner\'s free-text reply to a situational prompt: whether it is an appropriate natural reply, and whether it actually produced one of a small set of known target phrases. Always respond only via the provided tool.',
        },
        { role: 'user', content: user },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_production_verdict',
            description: 'Submit the judged verdict for the learner\'s answer.',
            parameters: {
              type: 'object',
              properties: {
                isAppropriate: { type: 'boolean', description: 'Does the answer make sense as a reply to the situation?' },
                usedChunkId: {
                  type: ['string', 'null'],
                  enum: usedChunkIdEnum,
                  description: 'The id of whichever known phrase was actually used, or null if none of them was.',
                },
                feedback: { type: 'string', description: 'One short sentence in Russian, the single most useful piece of feedback.' },
              },
              required: ['isAppropriate', 'usedChunkId', 'feedback'],
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
          `(model=${this.model}, finish_reason=${choice?.finish_reason ?? 'unknown'}, ` +
          `hasContent=${Boolean(choice?.message.content)}, refusal=${Boolean((choice?.message as { refusal?: unknown } | undefined)?.refusal)}).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(`OpenRouter tool call arguments were not valid JSON. Raw: ${toolCall.function.arguments.slice(0, 2000)}`);
    }

    const { isAppropriate, usedChunkId, feedback } = parsed as { isAppropriate?: unknown; usedChunkId?: unknown; feedback?: unknown };
    if (typeof isAppropriate !== 'boolean' || (typeof usedChunkId !== 'string' && usedChunkId !== null) || typeof feedback !== 'string') {
      throw new Error(`OpenRouter tool call returned an unexpected shape. Parsed: ${JSON.stringify(parsed).slice(0, 2000)}`);
    }

    return { isAppropriate, usedChunkId, feedback };
  }
}
