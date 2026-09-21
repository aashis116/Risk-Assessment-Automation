import type { Vendor, ScoreChange, Classification } from './types.js';

const REQUIRED_FIELDS: (keyof Classification)[] = ['severity', 'category', 'title', 'summary', 'recommendation'];

export function buildClassificationPrompt(vendor: Vendor, changes: ScoreChange[]): string {
  const changeLines = changes
    .map((c) => `- ${c.metric}: ${c.previous} -> ${c.current} (delta ${c.delta})`)
    .join('\n');

  return `You are a third-party risk analyst. A vendor's monitored risk scores changed.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
Business impact if this vendor fails or is breached: $${vendor.business_impact}
PII records exposed to this vendor: ${vendor.pii_record_count}

Score changes detected:
${changeLines}

Respond with ONLY a JSON object with these fields:
- severity: one of "low", "medium", "high", "critical"
- category: one of "information_security", "financial", "operational", "regulatory", "bsa_aml"
- title: a short ticket title (under 80 chars)
- summary: 1-2 sentence description of what changed and why it matters
- recommendation: a concrete next action for the vendor risk team`;
}

export function buildInitialRiskPrompt(vendor: Vendor): string {
  return `You are a third-party risk analyst. A new vendor has just completed onboarding and its first security ratings are in.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
Business impact if this vendor fails or is breached: $${vendor.business_impact}
PII records exposed to this vendor: ${vendor.pii_record_count}

Current scores:
- srs_score: ${vendor.current_srs_score}
- shodan_score: ${vendor.current_shodan_score}

Assess this vendor's baseline risk level based on these scores and business context alone (this is a first-time assessment, not a comparison to a prior score).

Respond with ONLY a JSON object with these fields:
- severity: one of "low", "medium", "high", "critical"
- category: one of "information_security", "financial", "operational", "regulatory", "bsa_aml"
- title: a short ticket title (under 80 chars)
- summary: 1-2 sentence description of this vendor's baseline risk and why it matters
- recommendation: a concrete next action for the vendor risk team`;
}

export function parseClassificationResponse(raw: string): Classification {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Partial<Classification>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse classification response: ${(err as Error).message}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!parsed[field]) {
      throw new Error(`Classification response missing required field: ${field}`);
    }
  }

  return parsed as Classification;
}
