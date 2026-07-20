import { Before, After } from '@cucumber/cucumber';

Before({ tags: '@browser' }, async function () {
  await this.openBrowser();
});

After({ tags: '@browser' }, async function () {
  await this.closeBrowser();
});
