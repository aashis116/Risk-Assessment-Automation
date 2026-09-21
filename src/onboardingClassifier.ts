import type { Question, VendorContext } from './types.js';

export function buildSectionPrompt(vendorContext: VendorContext, questions: Question[]): string {
  const questionLines = questions
    .map((q) => {
      const opts = q.options ? ` (choose one of: ${q.options.join(', ')})` : '';
      const req = q.required ? ' [required]' : '';
      return `- id ${q.id} (${q.type}${opts}${req}): ${q.label}`;
    })
    .join('\n');

  return `You are filling out a vendor risk onboarding questionnaire for a fictional test vendor, for demo purposes only.

Vendor: ${vendorContext.vendor_name} (${vendorContext.vendor_domain})

Answer each question below plausibly and consistently with a real-but-unremarkable SaaS vendor.
For "radio" questions, answer with EXACTLY one of the listed options.
For "number" questions, answer with a plain integer.
For "text"/"textarea" questions, answer with a concise 1-2 sentence answer.

Questions:
${questionLines}

Respond with ONLY a JSON object mapping each question id to its answer, e.g. {"17": 500, "21": "Yes"}.`;
}

export function parseSectionAnswers(raw: string, questions: Question[]): Record<string, string | number> {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Record<string, string | number>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse section answers: ${(err as Error).message}`);
  }

  for (const q of questions) {
    if (q.type === 'radio' && q.id in parsed && q.options && !q.options.includes(String(parsed[q.id]))) {
      throw new Error(`invalid value for question ${q.id}: "${parsed[q.id]}" not in [${q.options.join(', ')}]`);
    }
  }

  return parsed;
}
