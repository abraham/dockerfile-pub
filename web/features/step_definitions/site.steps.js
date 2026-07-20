import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Given('the site is up', async function () {
  let response;
  try {
    response = await fetch(this.baseUrl);
  } catch (err) {
    throw new Error(
      `Could not reach ${this.baseUrl} — is the dev server running? (${err.message})\n` +
        'Start it with: npm run dev',
    );
  }
  assert.ok(
    response.ok,
    `Expected ${this.baseUrl} to return a 2xx status, got ${response.status}`,
  );
});

When('I visit the home page', async function () {
  await this.navigateTo('/');
});

Then('the page title is {string}', async function (expectedTitle) {
  const title = await this.page.title();
  assert.equal(title, expectedTitle, `Expected page title "${expectedTitle}", got "${title}"`);
});

Then('I should see the heading {string}', async function (expectedText) {
  const headings = await this.page.$$eval('h1, h2, h3', (elements) =>
    elements.map((el) => el.textContent.trim()),
  );
  assert.ok(
    headings.some((h) => h === expectedText),
    `Expected to find heading "${expectedText}" but found: [${headings.join(', ')}]`,
  );
});

Then('I should see the text {string}', async function (expectedText) {
  const bodyText = await this.page.evaluate(() => document.body.innerText);
  assert.ok(bodyText.includes(expectedText), `Expected to find text "${expectedText}" on the page`);
});
