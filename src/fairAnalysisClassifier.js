export const FAIR_TEXT_FIELDS = [
  { name: 'msa', description: 'Master Services Agreement details' },
  { name: 'scope_of_work', description: "Description of the work performed by the vendor" },
  { name: 'medium_of_data', description: 'Method of data transfer (cloud, on-premises, etc.)' },
  { name: 'certifications', description: "Vendor's security certifications" },
  { name: 'compliance', description: "Vendor's compliance with relevant regulations" },
  { name: 'security_governance', description: "Vendor's security governance structure and policies" },
  { name: 'incident_response_plan', description: "Vendor's plan for responding to security incidents" },
  { name: 'continuous_monitoring', description: "Vendor's continuous security monitoring program" },
  { name: 'supply_chain_risk_mgmt', description: "Vendor's third-party/supply chain risk management program" },
  { name: 'security_awareness_training', description: "Vendor's employee security awareness training program" },
  { name: 'vulnerability_management', description: "Vendor's vulnerability management program" },
  { name: 'patch_management', description: "Vendor's patch management program" },
  { name: 'access_controls', description: "Vendor's access control practices" },
  { name: 'data_encryption', description: "Vendor's data encryption practices" },
  { name: 'network_security', description: "Vendor's network security controls" },
  { name: 'vulnerability_data', description: 'Summary of vulnerability findings from external security scans' },
  { name: 'configuration_data', description: 'Summary of configuration issues found in external security scans' },
  { name: 'compliance_data', description: "Vendor's compliance certification and audit status" },
  { name: 'risk_assessment', description: 'Overall risk assessment summary combining score and findings' },
  { name: 'threat_intelligence', description: 'Relevant threat intelligence for this vendor' },
  { name: 'security_questionnaire', description: "Status of vendor's security questionnaire responses" },
  { name: 'compliance_questionnaire', description: "Status of vendor's compliance questionnaire responses" },
  { name: 'vendor_performance', description: "Assessment of vendor's performance and security posture" },
  { name: 'third_party_vendor_list', description: "Vendor's known subprocessors/technologies (e.g. CDN, cloud host)" },
  { name: 'third_party_risk_assessment', description: "Risk assessment of vendor's subprocessors" },
  { name: 'third_party_security_questionnaire', description: 'Security questionnaire status for subprocessors' },
  { name: 'third_party_compliance_questionnaire', description: 'Compliance questionnaire status for subprocessors' },
];

export function buildFairAnalysisPrompt(vendor) {
  const fieldLines = FAIR_TEXT_FIELDS.map((f) => `- ${f.name}: ${f.description}`).join('\n');

  return `You are a third-party risk analyst writing a FAIR (Factor Analysis of Information Risk) assessment for a vendor, based on real external security scan data.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
UpGuard security rating: ${vendor.current_srs_score}/950
Shodan security score: ${vendor.current_shodan_score}/100
Estimated business impact if breached: $${vendor.business_impact}
PII records: ${vendor.pii_record_count}, SPII records: ${vendor.spii_record_count}, SOX records: ${vendor.sox_record_count}

Write realistic, professional 1-3 sentence content for each of the following fields, consistent with the vendor's actual security scores above (a good UpGuard/Shodan score should read as a healthy security posture, not a concerning one):

${fieldLines}

Respond with ONLY a JSON object mapping each field name to its text content.`;
}

export function parseFairAnalysisAnswers(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse FAIR analysis answers: ${err.message}`);
  }
}
