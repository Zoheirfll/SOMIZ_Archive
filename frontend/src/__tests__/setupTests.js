import "@testing-library/jest-dom";

// Polyfills requis par react-router-dom v7 dans jsdom
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
