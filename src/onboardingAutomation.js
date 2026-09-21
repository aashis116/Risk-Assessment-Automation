import { saveSession } from './browserLauncher.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanPause() {
  return delay(150 + Math.random() * 300);
}

async function pollUntil(check, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await delay(intervalMs);
  }
  throw new Error('Polling timed out waiting for page to be ready');
}

async function waitForQuestionsToRender(page) {
  await pollUntil(async () => (await page.locator('.question').count()) > 0);
}

export async function login(page, { baseURL, username, password }) {
  await page.goto(`${baseURL}/login.php`);

  if (page.url().includes('login.php')) {
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await humanPause();
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await humanPause();
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForLoadState('networkidle');
  }

  await saveSession(page.context());
}

export async function startVendorOnboarding(page, { baseURL }) {
  await page.goto(`${baseURL}/vendor-onboarding.php`);
  await page.getByRole('button', { name: /Vendor Onboarding Request/ }).click();
  await page.waitForLoadState('networkidle');
  return page.url();
}

export async function extractQuestions(page) {
  return page.evaluate(() => {
    const humanize = (s) => s.replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim();
    return Array.from(document.querySelectorAll('.question'))
      .map((q) => {
        const id = q.dataset.questionId;
        const label = humanize(q.querySelector('.question-label')?.textContent || '');
        const required = Boolean(q.querySelector('.required'));
        const radios = q.querySelectorAll('input[type="radio"]');
        const select = q.querySelector('select');
        const textarea = q.querySelector('textarea');
        const numberInput = q.querySelector('input[type="number"]');

        if (radios.length) {
          return { id, label, required, type: 'radio', options: Array.from(radios).map((r) => r.value) };
        }
        if (select) {
          return {
            id,
            label,
            required,
            type: 'select',
            options: Array.from(select.options).map((o) => o.value).filter(Boolean),
          };
        }
        if (textarea) return { id, label, required, type: 'textarea' };
        if (numberInput) return { id, label, required, type: 'number' };

        const namedInput = document.getElementById(`q_${id}`);
        if (!namedInput || namedInput.type === 'hidden') return { id, label, required, type: 'skip' };
        if (namedInput.type === 'date') return { id, label, required, type: 'date' };
        return { id, label, required, type: 'text' };
      })
      .filter((q) => q.id && q.type !== 'skip');
  });
}

export async function fillSection(page, questions, answers) {
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined || value === null || value === '') continue;

    if (q.type === 'radio') {
      await page.locator(`label:has(input[name="responses[${q.id}]"][value="${value}"])`).click();
    } else if (q.type === 'select') {
      await page.locator(`#q_${q.id}`).selectOption(String(value));
    } else {
      await page.locator(`#q_${q.id}`).fill(String(value));
    }
    await humanPause();
  }
}

export function applyIdentityOverrides(answers, questions, vendorContext) {
  const result = { ...answers };
  for (const q of questions) {
    if (/legal name/i.test(q.label)) result[q.id] = vendorContext.vendor_name;
    if (/primary domain/i.test(q.label)) result[q.id] = vendorContext.vendor_domain;
    if (/completed Procurement Onboarding/i.test(q.label)) result[q.id] = 'Yes';
  }
  return result;
}

export function findVendorId(vendors, vendorContext) {
  const matches = vendors.filter(
    (v) => v.vendor_name === vendorContext.vendor_name && v.vendor_domain === vendorContext.vendor_domain
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, v) => (v.id > best.id ? v : best)).id;
}

export async function approveVendor(page, { baseURL, requestId }) {
  await page.goto(`${baseURL}/vendor-onboarding-list.php?status=draft`);
  const form = page.locator(`form:has(input[name="request_id"][value="${requestId}"])`);
  await form.getByRole('button', { name: 'Approve' }).click();
  await page.waitForLoadState('networkidle');
}

export async function fillSectionUntilStable(page, answerQuestions, onProgress) {
  await waitForQuestionsToRender(page);
  const answeredIds = new Set();

  for (let pass = 0; pass < 6; pass += 1) {
    const questions = await extractQuestions(page);
    const newQuestions = questions.filter((q) => !answeredIds.has(q.id));
    if (newQuestions.length === 0) break;

    if (onProgress) onProgress(pass, newQuestions);
    const answers = answerQuestions(newQuestions);
    await fillSection(page, newQuestions, answers);

    newQuestions.forEach((q) => answeredIds.add(q.id));
  }
}

export async function goToNextSection(page) {
  const nextLink = page.getByRole('link', { name: /Next/ });
  if (await nextLink.count()) {
    const previousUrl = page.url();
    await nextLink.click();
    await page.waitForURL((url) => url.toString() !== previousUrl, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await waitForQuestionsToRender(page);
    return 'next';
  }

  const submitButton = page.getByRole('button', { name: /Submit|Complete|Finish/ });
  if (await submitButton.count()) {
    await submitButton.click();
    await page.waitForLoadState('networkidle');
    return 'submitted';
  }

  return 'done';
}
