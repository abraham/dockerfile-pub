import { Given, Then } from '@cucumber/cucumber';
import { AxePuppeteer } from '@axe-core/puppeteer';
import assert from 'node:assert/strict';

const ANIMATED_SELECTORS = {
  'explanation panel': '[data-testid="side-panel"]',
  'example indicator':
    '[role="group"][aria-label="Select Dockerfile example"] > [aria-hidden="true"]',
};

async function transitionDurations(page) {
  return page.evaluate((selectors) => {
    const result = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const el = document.querySelector(selector);
      result[name] = el
        ? getComputedStyle(el)
            .transitionDuration.split(',')
            .map((d) => parseFloat(d))
        : null;
    }
    return result;
  }, ANIMATED_SELECTORS);
}

Given('the user prefers reduced motion', async function () {
  await this.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
});

Given('the user prefers the {string} colour scheme', async function (scheme) {
  await this.page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
});

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Code tokens are inline targets constrained by the code's line height (WCAG 2.5.8 inline exception, ARCH-29).
const INLINE_TARGETS = '[aria-label="Dockerfile source"]';

Then('the page has no WCAG AA accessibility violations', async function () {
  // Let the panel finish its open transition so axe measures final colours.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const general = await new AxePuppeteer(this.page)
    .withTags(WCAG_AA_TAGS)
    .disableRules(['target-size'])
    .analyze();
  const targetSize = await new AxePuppeteer(this.page)
    .withRules(['target-size'])
    .exclude(INLINE_TARGETS)
    .analyze();
  const violations = [...general.violations, ...targetSize.violations];
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.nodes.length}): ${v.help}\n    ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join('\n    ')}`,
  );
  assert.equal(violations.length, 0, `Accessibility violations:\n  ${summary.join('\n  ')}`);
});

Then('the explanation panel and example indicator do not animate', async function () {
  const durations = await transitionDurations(this.page);
  for (const [name, values] of Object.entries(durations)) {
    assert.ok(values, `Could not find the ${name}`);
    assert.ok(
      values.every((v) => v === 0),
      `Expected the ${name} to have no transition, got ${values.join(', ')}s`,
    );
  }
});

Then('the explanation panel and example indicator animate', async function () {
  const durations = await transitionDurations(this.page);
  for (const [name, values] of Object.entries(durations)) {
    assert.ok(values, `Could not find the ${name}`);
    assert.ok(
      values.some((v) => v > 0),
      `Expected the ${name} to have a transition, got ${values.join(', ')}s`,
    );
  }
});
