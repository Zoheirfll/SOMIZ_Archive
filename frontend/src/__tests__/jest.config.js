module.exports = {
  rootDir: "../../",
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{js,jsx}"],
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/src/__tests__/setupTests.js"],
  moduleNameMapper: {
    "\.(css|less|scss)$": "identity-obj-proxy",
  },
  transform: {
    "^.+\.(js|jsx)$": "babel-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!(axios)/)"],
};
