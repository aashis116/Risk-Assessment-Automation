import nodemailer from 'nodemailer';

export function buildAlertEmail(vendor, issue, classification) {
  const subject = `[${classification.severity.toUpperCase()}] Risk alert for ${vendor.vendor_name}`;

  const text = `${classification.summary}

Recommendation: ${classification.recommendation}

Category: ${classification.category}
Severity: ${classification.severity}

Full ticket: ${issue.html_url}`;

  return { subject, text };
}

export async function sendAlertEmail({ user, appPassword, to, vendor, issue, classification }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });

  const { subject, text } = buildAlertEmail(vendor, issue, classification);

  return transporter.sendMail({ from: user, to, subject, text });
}
