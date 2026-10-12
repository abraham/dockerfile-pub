import '@testing-library/jest-dom/vitest';

// Node.js 22+ exposes an experimental `localStorage` global that returns
// `undefined` unless `--localstorage-file` is passed. Vitest's jsdom
// environment won't override it because it already exists in the Node.js
// global scope. Patch globalThis here so tests get jsdom's Storage objects.
/** @type {typeof globalThis & { jsdom?: { window: Window } }} */
const testGlobal = globalThis;
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
