/**
 * One extraction: the uploaded image + prompt v3 → one Gemini call → validated Extraction.
 * Independent of Vite, so a plain Node server can call it later (hosting) and scripts can call it directly.
 */
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { ExtractionSchema, extractionJsonSchema, referenceProblems, type Extraction } from '../src/types/extraction.ts';
import { optionProblems } from '../src/edit/applyEdits.ts';
import { recordCall } from './aiLedger.ts';

export const PROMPT_VERSION = 'v3';
const PROMPT = readFileSync(new URL('./prompts/extraction-v3.md', import.meta.url), 'utf8');

/**
 * USD per million tokens. Filled in once the model id and its price are confirmed; an unknown model is
 * still logged (tokens), with cost 0 and priceKnown false, so nothing is silently billed as free.
 */
export const PRICES: Record<string, { input: number; output: number }> = {};

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
}

const RETRYABLE = /fetch failed|ECONNRESET|socket|503|UNAVAILABLE/i;

export async function extractFigure(opts: { apiKey: string; model: string; mimeType: string; dataBase64: string; route?: string }): Promise<ExtractResult> {
  const { apiKey, model, mimeType, dataBase64 } = opts;
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
          abortSignal: AbortSignal.timeout(300_000),
        },
      });
      break;
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (attempt < 2 && RETRYABLE.test(msg)) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (/abort|timeout/i.test(msg)) throw new ExtractError('The model took longer than 5 minutes. Try again, or a smaller image.', 504);
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
  const costUsd = price ? (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6 : 0;
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
  return { extraction: parsed.data, problems: [...referenceProblems(parsed.data), ...optionProblems(parsed.data)], model, promptVersion: PROMPT_VERSION, seconds, usage, costUsd, priceKnown: !!price };
}
