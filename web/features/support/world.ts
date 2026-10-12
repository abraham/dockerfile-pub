import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const DEFAULT_BASE_URL = 'http://localhost:5173';

export class PuppeteerWorld extends World {
  baseUrl: string;
  // Set by the @browser Before hook (hooks.ts) before any step runs.
  browser!: Browser;
  page!: Page;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL || DEFAULT_BASE_URL;
  }

  async openBrowser() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.page = await this.browser.newPage();
  }

  async closeBrowser() {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async navigateTo(path = '/') {
    const url = `${this.baseUrl}${path}`;
    await this.page.goto(url, { waitUntil: 'networkidle0' });
  }
}

setWorldConstructor(PuppeteerWorld);
