// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom ne fournit pas window.matchMedia — nécessaire pour useIsMobile()
// (hooks/useIsMobile.js), utilisé par Navbar et plusieurs pages. Par défaut
// simule un viewport desktop (matches: false) pour préserver le comportement
// des tests existants ; un test spécifique au mobile peut le surcharger.
if (typeof window !== 'undefined' && !window.matchMedia) {
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
