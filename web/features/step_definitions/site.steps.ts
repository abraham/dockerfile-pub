import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { KeyInput } from 'puppeteer';
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

const PANEL = '[data-testid="side-panel"]';
const VIEWER = '[aria-label="Dockerfile source"]';

/** Waits until the panel's `data-state` is `state` (PNL-2). */
async function waitForPanel(world: PuppeteerWorld, state: 'open' | 'closed') {
  await world.page.waitForFunction(
    (selector, expected) =>
      document.querySelector(selector)?.getAttribute('data-state') === expected,
    { timeout: 3000 },
    PANEL,
    state,
  );
}

/** Clicks the first token button in the viewer whose text is exactly `text`. */
async function clickToken(this: PuppeteerWorld, text: string) {
  // Match by text so the step works regardless of the explanation wording.
  const clicked = await this.page.evaluate(
    (viewer, tokenText) => {
      const btn = [...(document.querySelector(viewer)?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === tokenText,
      );
      btn?.click();
      return Boolean(btn);
    },
    VIEWER,
    text,
  );
  assert.ok(clicked, `Could not find a clickable "${text}" token in the Dockerfile viewer`);
  await waitForPanel(this, 'open');
}

When('I click the {string} instruction', clickToken);
When('I click the {string} command fragment', clickToken);

Then('the explanation panel is open', async function (this: PuppeteerWorld) {
  const state = await this.page.$eval(PANEL, (el) => el.getAttribute('data-state'));
  assert.equal(state, 'open', 'Expected the explanation panel to be open');
});

Then('the explanation panel is closed', async function (this: PuppeteerWorld) {
  await waitForPanel(this, 'closed');
  const inert = await this.page.$eval(PANEL, (el) => el.hasAttribute('inert'));
  assert.ok(inert, 'Expected the closed explanation panel to be inert');
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
  await this.page.click('button[aria-label="Close explanation"]');
  await waitForPanel(this, 'closed');
});

When('I press {string}', async function (this: PuppeteerWorld, key: KeyInput) {
  await this.page.keyboard.press(key);
});

When('I press Tab until the Dockerfile viewer has focus', async function (this: PuppeteerWorld) {
  for (let i = 0; i < 20; i++) {
    await this.page.keyboard.press('Tab');
    const inViewer = await this.page.evaluate(
      (viewer) => Boolean(document.activeElement?.closest(viewer)),
      VIEWER,
    );
    if (inViewer) return;
  }
  assert.fail('The Dockerfile viewer never received focus');
});

Then('focus is on the {string} token', async function (this: PuppeteerWorld, text: string) {
  const focused = await this.page.evaluate(
    (viewer) =>
      document.activeElement?.closest(viewer) ? document.activeElement.textContent?.trim() : null,
    VIEWER,
  );
  assert.equal(focused, text, `Expected focus on the "${text}" token`);
});

Then('focus is inside the explanation panel', async function (this: PuppeteerWorld) {
  const inside = await this.page.evaluate(
    (panel) => Boolean(document.activeElement?.closest(panel)),
    PANEL,
  );
  assert.ok(inside, 'Expected focus inside the explanation panel');
});

Then(
  'the explanation panel is between {int} and {int} pixels wide',
  async function (this: PuppeteerWorld, min: number, max: number) {
    // Let the opening transition finish before measuring.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const width = await this.page.$eval(PANEL, (el) => el.getBoundingClientRect().width);
    assert.ok(width >= min && width <= max, `Expected a width of ${min}-${max}px, got ${width}`);
  },
);

Then(
  'the explanation panel is pinned to the bottom of the viewport',
  async function (this: PuppeteerWorld) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { position, bottom, viewport } = await this.page.$eval(PANEL, (el) => ({
      position: getComputedStyle(el).position,
      bottom: el.getBoundingClientRect().bottom,
      viewport: window.innerHeight,
    }));
    assert.equal(position, 'fixed');
    assert.ok(Math.abs(bottom - viewport) <= 1, `Expected the sheet at the bottom, got ${bottom}`);
  },
);

Then(
  'the {string} token is above the explanation panel',
  async function (this: PuppeteerWorld, text: string) {
    await this.page.waitForFunction(
      (viewer, panel, tokenText) => {
        const btn = [...(document.querySelector(viewer)?.querySelectorAll('button') ?? [])].find(
          (b) => b.textContent?.trim() === tokenText,
        );
        const sheet = document.querySelector(panel);
        if (!btn || !sheet) return false;
        const token = btn.getBoundingClientRect();
        return token.top >= 0 && token.bottom <= sheet.getBoundingClientRect().top;
      },
      { timeout: 3000 },
      VIEWER,
      PANEL,
      text,
    );
  },
);

Then(
  'the last line of the Dockerfile can be scrolled above the explanation panel',
  async function (this: PuppeteerWorld) {
    const { lineBottom, sheetTop } = await this.page.evaluate(
      (viewer, panel) => {
        const grid = document.querySelector(viewer);
        const lines = grid?.querySelectorAll('[data-line]') ?? [];
        const last = lines[lines.length - 1];
        // Scroll every scrollable ancestor of the last line, then the page, to the end.
        for (let el = last?.parentElement; el; el = el.parentElement)
          el.scrollTop = el.scrollHeight;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        return {
          lineBottom: last?.getBoundingClientRect().bottom ?? Infinity,
          sheetTop: document.querySelector(panel)?.getBoundingClientRect().top ?? 0,
        };
      },
      VIEWER,
      PANEL,
    );
    assert.ok(
      lineBottom <= sheetTop,
      `Expected the last line (bottom ${lineBottom}) above the sheet (top ${sheetTop})`,
    );
  },
);

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
