import "@testing-library/jest-dom/vitest";

// vitest 4 + jsdom 29: the jsdom environment copies `sessionStorage` into the
// test global but drops `localStorage`, so any hook touching storage crashes
// with "Cannot read properties of undefined (reading 'clear')". The real window
// behind the environment (exposed as `globalThis.jsdom`) has a working
// localStorage; borrow it from there. Same realm, so `vi.spyOn(Storage.prototype,
// "setItem")` in tests still observes writes.
const driverWindow = (globalThis as { jsdom?: { window?: Window & typeof globalThis } }).jsdom?.window;
if (typeof window !== "undefined" && window.localStorage === undefined && driverWindow) {
  window.localStorage = driverWindow.localStorage;
}
