import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PuppeteerWorld } from '../support/world';

const REWRITE_BUTTON = 'button[aria-label="Rewrite this Dockerfile with on-device AI"]';
const DIALOG = 'dialog[aria-labelledby="rewrite-title"]';

const REWRITTEN_DOCKERFILE = `FROM node:26-alpine
WORKDIR /app
COPY . .
RUN npm install
USER node
EXPOSE 3000
CMD ["node", "server.js"]`;

const REPLY = `\`\`\`dockerfile
${REWRITTEN_DOCKERFILE}
\`\`\`

Changes:
- Runs the app as the non-root node user.`;

declare global {
  interface Window {
    LanguageModel?: unknown;
  }
}

Given('the browser has no built-in AI', async function (this: PuppeteerWorld) {
  await this.page.evaluateOnNewDocument(() => {
    delete window.LanguageModel;
  });
});

// CI's Chrome has no on-device model, so the flow runs against a scripted stand-in (spec §11).
Given('a fake on-device AI model', async function (this: PuppeteerWorld) {
  await this.page.evaluateOnNewDocument((reply: string) => {
    const session = () => ({
      contextUsage: 0,
      contextWindow: 100_000,
      measureContextUsage: () => Promise.resolve(1),
      promptStreaming: () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue(reply);
            controller.close();
          },
        }),
      clone: () => Promise.resolve(session()),
      destroy: () => {},
    });
    Object.defineProperty(window, 'LanguageModel', {
      configurable: true,
      // A class, like Chrome's, whose constructor throws.
      value: class {
        static availability = () => Promise.resolve('available');
        static create = () => Promise.resolve(session());
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    });
  }, REPLY);
});

Then('there is no Rewrite button', async function (this: PuppeteerWorld) {
  // The support check runs after first render; give it time to (not) show the button.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await this.page.$(REWRITE_BUTTON), null, 'Expected no Rewrite button');
});

When('I open the rewrite dialog', async function (this: PuppeteerWorld) {
  await this.page.waitForSelector(REWRITE_BUTTON, { timeout: 3000 });
  await this.page.click(REWRITE_BUTTON);
  await this.page.waitForSelector(`${DIALOG}[open]`, { timeout: 3000 });
});

When('I ask the AI to {string}', async function (this: PuppeteerWorld, request: string) {
  await this.page.type(`${DIALOG} textarea`, request);
  const clicked = await this.page.evaluate((dialog) => {
    const button = [...(document.querySelector(dialog)?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'Rewrite',
    );
    button?.click();
    return Boolean(button);
  }, DIALOG);
  assert.ok(clicked, 'Could not find the Rewrite button in the dialog');
});

Then('the rewrite dialog shows what changed', async function (this: PuppeteerWorld) {
  await this.page.waitForFunction(
    (dialog) => document.querySelector(`${dialog} h3`)?.textContent?.startsWith('What changed'),
    { timeout: 3000 },
    DIALOG,
  );
  const diff = await this.page.$eval(
    `${DIALOG} [aria-label="Changes to the Dockerfile"]`,
    (el) => el.textContent ?? '',
  );
  assert.ok(diff.includes('+ USER node'), `Expected the diff to add "USER node", got:\n${diff}`);
});

When('I open the rewrite in the viewer', async function (this: PuppeteerWorld) {
  await this.page.evaluate((dialog) => {
    [...(document.querySelector(dialog)?.querySelectorAll('button') ?? [])]
      .find((b) => b.textContent?.trim() === 'Open in viewer')
      ?.click();
  }, DIALOG);
  await this.page.waitForFunction((dialog) => !document.querySelector(dialog), {}, DIALOG);
});

Then('the {string} example is selected', async function (this: PuppeteerWorld, label: string) {
  const pressed = await this.page.evaluate((text) => {
    const group = document.querySelector('[role="group"][aria-label="Select Dockerfile example"]');
    const button = [...(group?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === text,
    );
    return button?.getAttribute('aria-pressed');
  }, label);
  assert.equal(pressed, 'true', `Expected the "${label}" example to be selected`);
});
