module.exports = {
  rootDir: ".",
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{js,jsx}"],
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setupTests.js"],
  moduleNameMapper: {
    "\\.(css|less|scss)$": "identity-obj-proxy",
    "\\.(jpg|jpeg|png|gif|svg|ico)$": "<rootDir>/src/__tests__/__mocks__/fileMock.js",
  },
  transform: {
    "^.+\\.(js|jsx)$": "babel-jest",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(axios|react-router|react-router-dom|@remix-run)/)",
  ],
  testEnvironmentOptions: {
    customExportConditions: ["node", "require", "default"],
  },
};
