/**
 * One extraction: the uploaded image + prompt v3 → one Gemini call → validated Extraction.
 * Independent of Vite, so a plain Node server can call it later (hosting) and scripts can call it directly.
 */
import { readFileSync } from 'node:fs';
import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import { ExtractionSchema, extractionJsonSchema, referenceProblems, type Extraction } from '../src/types/extraction.ts';
import { optionProblems } from '../src/edit/applyEdits.ts';
import { recordCall } from './aiLedger.ts';

export const PROMPT_VERSION = 'v3';
const PROMPT = readFileSync(new URL('./prompts/extraction-v3.md', import.meta.url), 'utf8');

/**
 * USD per million tokens, Standard paid tier. Output includes thinking; `cached` is input the provider served from
 * its cache. An unknown model is still logged (tokens), with cost 0 and priceKnown false, so nothing is silently
 * billed as free. Free-tier calls cost nothing, so this over-counts them: the daily budget is then a cautious limit.
 */
export const PRICES: Record<string, { input: number; output: number; cached: number }> = {
  // From Google's pricing page, checked 2026-11-18. A typical figure: ~6k in, 16–30k out ≈ $0.13–0.24.
  'gemini-4-hydrogen': { input: 1.5, output: 7.5, cached: 0.075 },
};

export class ExtractError extends Error {
  // Plain fields (not constructor parameter properties): scripts run under Node's type stripping, which doesn't support them.
  readonly status: number;
  readonly detail?: unknown;
  constructor(message: string, status = 500, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export interface ExtractResult {
  extraction: Extraction;
  problems: string[];
  model: string;
  promptVersion: string;
  seconds: number;
  usage: { inputTokens: number; outputTokens: number; thoughtTokens: number };
  costUsd: number;
  priceKnown: boolean;
  /** Set when the run used a reduced thinking level (EXTRACT_THINKING), so it's never mistaken for a careful read. */
  thinking?: string;
}

const RETRYABLE = /fetch failed|ECONNRESET|socket|503|UNAVAILABLE/i;
const BUSY = /503|UNAVAILABLE|high demand/i;
/**
 * Waits before each retry, in seconds. "High demand" refusals from the provider come in spikes that last longer
 * than a network hiccup, so retries are spread over about half a minute.
 */
const RETRY_WAIT = [5, 10, 15];
/** How long one model call may take. A busy free tier has been seen taking over 5 minutes on a dense figure. */
const TIMEOUT_MINUTES = 10;

/**
 * Sends one image to the model with the extraction prompt, and returns the checked result.
 * Network hiccups and "high demand" refusals are retried three times. The call is logged (with its cost) before the
 * reply is checked, so spend is never missed. A reply in the wrong shape is an error; references that don't match up
 * are returned as `problems`, so they can be shown instead of hidden.
 *
 * `thinking` ('LOW') makes the model think less: about 3× faster, but in testing it asked no questions and quietly
 * picked one reading of ambiguous arrow ends instead of asking. So it's off unless chosen (EXTRACT_THINKING), and
 * a run made with it says so.
 */
export async function extractFigure(opts: { apiKey: string; model: string; mimeType: string; dataBase64: string; route?: string; thinking?: string }): Promise<ExtractResult> {
  const { apiKey, model, mimeType, dataBase64, thinking } = opts;
  if (!apiKey) throw new ExtractError('No GEMINI_API_KEY in .env.local.', 400);
  if (!model) throw new ExtractError('No EXTRACT_MODEL in .env.local.', 400);
  const ai = new GoogleGenAI({ apiKey });
  const started = Date.now();
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: dataBase64 } }, { text: PROMPT }] }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: extractionJsonSchema(),
          temperature: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT_MINUTES * 60_000),
          ...(thinking ? { thinkingConfig: { thinkingLevel: thinking as ThinkingLevel } } : {}),
        },
      });
      break;
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (attempt < RETRY_WAIT.length && RETRYABLE.test(msg)) {
        await new Promise((r) => setTimeout(r, RETRY_WAIT[attempt] * 1000));
        continue;
      }
      if (/abort|timeout/i.test(msg)) throw new ExtractError(`The model took longer than ${TIMEOUT_MINUTES} minutes. Try again later, or open a saved example.`, 504);
      // Quota used up (429). The free tier allows only 20 readings a day for the whole project (tested 2026-11-18),
      // and failed or refused requests count too. Said plainly, since the raw message is long and gets cut off.
      if (/"code":\s*429|RESOURCE_EXHAUSTED/i.test(msg)) {
        throw new ExtractError(/PerDay/i.test(msg)
          ? "Today's free-tier limit for this model is used up (it's shared by everyone using the app). It resets at midnight Pacific time. The saved examples still open."
          : 'Too many readings in the last minute. Try again in a minute; the saved examples still open.', 429);
      }
      if (BUSY.test(msg)) throw new ExtractError('The model is busy right now (the provider reports high demand). Try again in a few minutes, or open a saved example.', 503);
      if (/"code":\s*402|prepayment credits/i.test(msg)) throw new ExtractError('The Gemini account is out of prepaid credit.', 402);
      throw new ExtractError(`The model call failed: ${msg.slice(0, 300)}`, 502);
    }
  }
  const seconds = (Date.now() - started) / 1000;

  // Log the call before anything else can fail, so spend is never missed.
  const u = res.usageMetadata ?? {};
  const cached = u.cachedContentTokenCount ?? 0;
  const usage = {
    inputTokens: (u.promptTokenCount ?? 0) - cached,
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    thoughtTokens: u.thoughtsTokenCount ?? 0,
  };
  const price = PRICES[model];
  const costUsd = price ? (usage.inputTokens * price.input + cached * price.cached + usage.outputTokens * price.output) / 1e6 : 0;
  recordCall({ route: opts.route ?? 'extract', model, inputTokens: usage.inputTokens, cachedTokens: cached, outputTokens: usage.outputTokens, thoughtTokens: usage.thoughtTokens, costUsd });

  const finish = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason) throw new ExtractError(`The model declined the image (${res.promptFeedback.blockReason}).`, 502);
  let raw: unknown;
  try {
    raw = JSON.parse(res.text ?? '');
  } catch {
    throw new ExtractError(finish === 'MAX_TOKENS' ? 'The reply was cut off (output limit reached).' : 'The model did not return valid JSON.', 502);
  }
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExtractError('The reply did not match the extraction format.', 502, parsed.error.issues.slice(0, 10));
  }
  return { extraction: parsed.data, problems: [...referenceProblems(parsed.data), ...optionProblems(parsed.data)], model, promptVersion: PROMPT_VERSION, seconds, usage, costUsd, priceKnown: !!price, ...(thinking ? { thinking } : {}) };
}
