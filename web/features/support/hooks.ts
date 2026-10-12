import { Before, After, Status } from '@cucumber/cucumber';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PuppeteerWorld } from './world';

Before({ tags: '@browser' }, async function (this: PuppeteerWorld) {
  await this.openBrowser();
});

After({ tags: '@browser' }, async function (this: PuppeteerWorld, { pickle, result }) {
  if (result?.status === Status.FAILED && this.page) {
    const artifactsDir = process.env.FEATURE_ARTIFACTS_DIR || 'features/artifacts';
    const safeName = pickle.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const screenshotPath = path.join(artifactsDir, `${safeName || 'scenario'}-${Date.now()}.png`);
    await fs.mkdir(artifactsDir, { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
  }
  await this.closeBrowser();
});
