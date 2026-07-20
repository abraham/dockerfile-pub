import { setWorldConstructor } from '@cucumber/cucumber';
import puppeteer from 'puppeteer';

class PuppeteerWorld {
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
}

setWorldConstructor(PuppeteerWorld);
