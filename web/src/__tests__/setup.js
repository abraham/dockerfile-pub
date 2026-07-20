import '@testing-library/jest-dom';

// Node.js 22+ defines `localStorage` as an experimental global (unavailable without
// --localstorage-file). Vitest's jsdom environment does not override Node.js globals
// that are not in its internal key list, so `localStorage` remains undefined.
// Explicitly point it at jsdom's implementation so tests work on any Node.js version.
if (typeof localStorage === 'undefined' && globalThis.jsdom?.window?.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: globalThis.jsdom.window.localStorage,
  });
}
