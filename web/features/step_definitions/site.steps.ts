import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PuppeteerWorld } from '../support/world';

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

Given('the site is up', async function (this: PuppeteerWorld) {
  let response;
  try {
    response = await fetch(this.baseUrl);
  } catch (err) {
    throw new Error(
      `Could not reach ${this.baseUrl} — is the dev server running? (${(err as Error).message})\n` +
        'Start it with: npm run dev',
      { cause: err },
    );
  }
  assert.ok(response.ok, `Expected ${this.baseUrl} to return a 2xx status, got ${response.status}`);
});

When('I visit the home page', async function (this: PuppeteerWorld) {
  await this.navigateTo('/');
});

Given(
  'the viewport is {int} by {int}',
  async function (this: PuppeteerWorld, width: number, height: number) {
    await this.page.setViewport({ width, height });
  },
);

Given('Content Security Policy violations are recorded', async function (this: PuppeteerWorld) {
  await this.page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`);
    });
  });
});

Then('no Content Security Policy violations were recorded', async function (this: PuppeteerWorld) {
  const violations = await this.page.evaluate(() => window.__cspViolations);
  assert.deepEqual(violations, [], `CSP violations: ${violations.join('; ')}`);
});

Then('the page title is {string}', async function (this: PuppeteerWorld, expectedTitle: string) {
  const title = await this.page.title();
  assert.equal(title, expectedTitle, `Expected page title "${expectedTitle}", got "${title}"`);
});

Then(
  'I should see the heading {string}',
  async function (this: PuppeteerWorld, expectedText: string) {
    const headings = await this.page.$$eval('h1, h2, h3', (elements) =>
      elements.map((el) => el.textContent?.trim() ?? ''),
    );
    assert.ok(
      headings.some((h) => h === expectedText),
      `Expected to find heading "${expectedText}" but found: [${headings.join(', ')}]`,
    );
  },
);

Then('I should see the text {string}', async function (this: PuppeteerWorld, expectedText: string) {
  const bodyText = await this.page.evaluate(() => document.body.innerText);
  assert.ok(bodyText.includes(expectedText), `Expected to find text "${expectedText}" on the page`);
});

// ─── Instruction explanation steps ────────────────────────────────────────────

When(
  'I click the {string} instruction',
  async function (this: PuppeteerWorld, instruction: string) {
    // Interactive instruction keywords are rendered as <button> elements inside
    // the "Dockerfile source" region.  Match by aria-label prefix so the step
    // works regardless of the full title text.
    const clicked = await this.page.evaluate((text) => {
      const region = document.querySelector('[aria-label="Dockerfile source"]');
      if (!region) return false;
      const btn = [...region.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === text,
      );
      if (!btn) return false;
      btn.click();
      return true;
    }, instruction);
    assert.ok(
      clicked,
      `Could not find a clickable "${instruction}" instruction in the Dockerfile viewer`,
    );
    // Allow React/Preact to re-render
    await this.page.waitForFunction(
      () =>
        document.querySelector('[data-testid="side-panel"]')?.getAttribute('aria-hidden') ===
        'false',
      { timeout: 3000 },
    );
  },
);

Then('the explanation panel is open', async function (this: PuppeteerWorld) {
  const ariaHidden = await this.page.$eval('[data-testid="side-panel"]', (el) =>
    el.getAttribute('aria-hidden'),
  );
  assert.equal(
    ariaHidden,
    'false',
    'Expected the explanation panel to be open (aria-hidden="false")',
  );
});

Then('the explanation panel is closed', async function (this: PuppeteerWorld) {
  const ariaHidden = await this.page.$eval('[data-testid="side-panel"]', (el) =>
    el.getAttribute('aria-hidden'),
  );
  assert.equal(
    ariaHidden,
    'true',
    'Expected the explanation panel to be closed (aria-hidden="true")',
  );
});

Then(
  'the explanation panel shows the title {string}',
  async function (this: PuppeteerWorld, expectedTitle: string) {
    const panelTitle = await this.page.$eval('[data-testid="side-panel"] h2 code', (el) =>
      el.textContent?.trim(),
    );
    assert.equal(
      panelTitle,
      expectedTitle,
      `Expected explanation panel title "${expectedTitle}", got "${panelTitle}"`,
    );
  },
);

When('I close the explanation panel', async function (this: PuppeteerWorld) {
  await this.page.click('button[aria-label="Close explanation panel"]');
  await this.page.waitForFunction(
    () =>
      document.querySelector('[data-testid="side-panel"]')?.getAttribute('aria-hidden') === 'true',
    { timeout: 3000 },
  );
});

// ─── Example switcher steps ───────────────────────────────────────────────────

When('I select the {string} example', async function (this: PuppeteerWorld, label: string) {
  const clicked = await this.page.evaluate((text) => {
    const group = document.querySelector('[role="group"][aria-label="Select Dockerfile example"]');
    if (!group) return false;
    const btn = [...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  assert.ok(clicked, `Could not find the "${label}" example button in the toggler`);
  // Wait until the selected button reflects aria-pressed="true"
  await this.page.waitForFunction(
    (text) => {
      const group = document.querySelector(
        '[role="group"][aria-label="Select Dockerfile example"]',
      );
      if (!group) return false;
      const btn = [...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
      return btn?.getAttribute('aria-pressed') === 'true';
    },
    { timeout: 3000 },
    label,
  );
});

Then(
  'the Dockerfile viewer contains {string}',
  async function (this: PuppeteerWorld, expectedText: string) {
    const viewerText = await this.page.$eval(
      '[aria-label="Dockerfile source"]',
      (el) => el.textContent ?? '',
    );
    assert.ok(
      viewerText.includes(expectedText),
      `Expected the Dockerfile viewer to contain "${expectedText}"`,
    );
  },
);

Then('the Dockerfile viewer content is visible', async function (this: PuppeteerWorld) {
  const metrics = await this.page.$eval('[aria-label="Dockerfile source"]', (el) => {
    const viewerRect = el.getBoundingClientRect();
    const firstLine = el.querySelector('[data-line]');
    const firstLineRect = firstLine?.getBoundingClientRect();
    const style = getComputedStyle(el);

    return {
      display: style.display,
      visibility: style.visibility,
      viewerHeight: viewerRect.height,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      hasFirstLine: Boolean(firstLine),
      firstLineVisible:
        firstLineRect !== undefined &&
        firstLineRect.bottom > viewerRect.top &&
        firstLineRect.top < viewerRect.bottom,
    };
  });

  assert.notEqual(metrics.display, 'none', 'Expected Dockerfile viewer display to not be none');
  assert.notEqual(
    metrics.visibility,
    'hidden',
    'Expected Dockerfile viewer visibility to not be hidden',
  );
  assert.ok(metrics.viewerHeight > 0, 'Expected Dockerfile viewer to have visible height');
  assert.ok(metrics.clientHeight > 0, 'Expected Dockerfile viewer to have positive clientHeight');
  assert.ok(metrics.scrollHeight > 0, 'Expected Dockerfile viewer to contain scrollable content');
  assert.ok(metrics.hasFirstLine, 'Expected Dockerfile viewer to render at least one line');
  assert.ok(
    metrics.firstLineVisible,
    'Expected at least one Dockerfile line to be visible in the viewer',
  );
});
