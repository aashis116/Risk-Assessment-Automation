import {
  detectScoreChanges,
  hasOpenTicket,
  recordTicket,
  updateScores,
} from './stateStore.js';
import { formatIssue } from './githubClient.js';

export async function processVendor(vendor, { state, previousScores, classify, createTicket, notify, thresholds }) {
  const currentScores = {
    srs_score: vendor.current_srs_score,
    shodan_score: vendor.current_shodan_score,
  };

  const changes = detectScoreChanges(previousScores, currentScores, thresholds);
  const created = [];

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
