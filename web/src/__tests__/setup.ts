import '@testing-library/jest-dom/vitest';

// Node.js 22+ exposes an experimental `localStorage` global that returns
// `undefined` unless `--localstorage-file` is passed. Vitest's jsdom
// environment won't override it because it already exists in the Node.js
// global scope. Patch globalThis here so tests get jsdom's Storage objects.
const testGlobal = globalThis as typeof globalThis & { jsdom?: { window: Window } };
if (testGlobal.jsdom) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: testGlobal.jsdom.window.localStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: testGlobal.jsdom.window.sessionStorage,
    writable: true,
    configurable: true,
  });
}

// jsdom has no modal dialogs: emulate showModal(), close() with its close event, and Escape.
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        document.removeEventListener('keydown', onKeyDown);
        this.close();
      };
      document.addEventListener('keydown', onKeyDown);
    },
    close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}
