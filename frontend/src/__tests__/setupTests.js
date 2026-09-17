import "@testing-library/jest-dom";

// Polyfills requis par react-router-dom v7 dans jsdom
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// jsdom ne fournit pas window.matchMedia — nécessaire pour useIsMobile()
// (hooks/useIsMobile.js), utilisé par Navbar et plusieurs pages.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom ne fournit ni ResizeObserver ni de dimensions de layout réelles —
// Recharts (ResponsiveContainer, graphiques de /statistiques) s'appuie sur
// les deux pour décider s'il rend son contenu, et ne rend rien (width/height
// à 0) sans ce polyfill.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this._callback = callback;
    }
    observe(target) {
      const rect = { width: 500, height: 300, top: 0, left: 0, right: 500, bottom: 300, x: 0, y: 0 };
      this._callback([{ target, contentRect: rect, borderBoxSize: [{ inlineSize: 500, blockSize: 300 }] }], this);
    }
    unobserve() {}
    disconnect() {}
  };
}
// jsdom ne fournit pas IntersectionObserver — utilisé pour le chargement
// paresseux des miniatures PDF dans ScanImportModal.jsx (LazyThumb, voir
// 2026-09-15). Ce mock déclenche `isIntersecting: true` immédiatement (via
// microtask) pour préserver le comportement synchrone des tests existants
// (tout se monte tout de suite, comme avant l'introduction du lazy-load).
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class MockIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      Promise.resolve().then(() => {
        this.callback([{ isIntersecting: true, target }]);
      });
    }
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = MockIntersectionObserver;
  global.IntersectionObserver = MockIntersectionObserver;
}
if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 500 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 300 });
}
if (typeof Element !== "undefined") {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 500, height: 300, top: 0, left: 0, right: 500, bottom: 300, x: 0, y: 0, toJSON() {} };
  };
}
