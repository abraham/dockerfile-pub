import { Before, After } from '@cucumber/cucumber';
import fs from 'node:fs/promises';
import path from 'node:path';

Before({ tags: '@browser' }, async function () {
  await this.openBrowser();
});

After({ tags: '@browser' }, async function ({ pickle, result }) {
  if (result?.status === 'FAILED' && this.page) {
    const artifactsDir = process.env.FEATURE_ARTIFACTS_DIR || 'features/artifacts';
    const safeName = pickle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const screenshotPath = path.join(artifactsDir, `${safeName || 'scenario'}-${Date.now()}.png`);
    await fs.mkdir(artifactsDir, { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
  }
  await this.closeBrowser();
});
