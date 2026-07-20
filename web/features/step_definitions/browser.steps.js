import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Given('a headless browser is open', function () {
  assert.ok(this.browser, 'Expected browser to be launched');
  assert.ok(this.page, 'Expected a page to be open');
});

Then('a new blank page can be loaded', async function () {
  await this.page.goto('about:blank');
  const title = await this.page.title();
  assert.equal(title, '', 'Expected blank page to have an empty title');
});
