import {
  detectScoreChanges,
  hasOpenTicket,
  recordTicket,
  updateScores,
} from './stateStore.js';
import { formatIssue, formatInitialRiskIssue } from './githubClient.js';
import type { Vendor, VendorState, Classification, CreatedIssue, Issue, ScoreChange } from './types.js';

interface NotifyArgs {
  vendor: Vendor;
  issue: CreatedIssue;
  classification: Classification;
}

export async function processVendor(
  vendor: Vendor,
  {
    state,
    previousScores,
    classify,
    createTicket,
    notify,
    thresholds,
  }: {
    state: VendorState;
    previousScores: Record<string, number> | null;
    classify: (vendor: Vendor, changes: ScoreChange[]) => Promise<Classification>;
    createTicket: (issue: Issue) => Promise<CreatedIssue>;
    notify?: (args: NotifyArgs) => Promise<void>;
    thresholds?: { srs: number; shodan: number };
  }
): Promise<CreatedIssue[]> {
  const currentScores: Record<string, number> = {
    srs_score: vendor.current_srs_score ?? 0,
    shodan_score: vendor.current_shodan_score ?? 0,
  };

  const changes = detectScoreChanges(previousScores, currentScores, thresholds);
  const created: CreatedIssue[] = [];

  for (const change of changes) {
    if (hasOpenTicket(state, vendor.id, change.metric)) continue;

    const classification = await classify(vendor, [change]);
    const issue = formatIssue(vendor, [change], classification);
    const result = await createTicket(issue);

    recordTicket(state, vendor.id, change.metric, result.number);
    created.push(result);

    if (notify) {
      await notify({ vendor, issue: result, classification });
    }
  }

  updateScores(state, vendor.id, currentScores);
  return created;
}

export async function assessNewVendorRisk(
  vendor: Vendor,
  {
    classify,
    createTicket,
    notify,
  }: {
    classify: (vendor: Vendor) => Promise<Classification>;
    createTicket: (issue: Issue) => Promise<CreatedIssue>;
    notify?: (args: NotifyArgs) => Promise<void>;
  }
): Promise<CreatedIssue> {
  const classification = await classify(vendor);
  const issue = formatInitialRiskIssue(vendor, classification);
  const result = await createTicket(issue);

  if (notify) {
    await notify({ vendor, issue: result, classification });
  }

  return result;
}
