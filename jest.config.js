// Standalone unit-test harness. Intentionally separate from `gulp test` (the SPFx
// 1.4.1 Karma chain) so it runs on a modern Node without the legacy toolchain.
// Tests live OUTSIDE src/ so the SPFx TypeScript task never compiles them
// (1.4.1 ignores tsconfig "exclude"). Heavy SPFx/native modules are stubbed.
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
  testEnvironment: 'jsdom',   // jsdom works for both suites (utils needs DOM); avoids env drift
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,                 // transpile-only: don't typecheck SPFx imports
      tsconfig: { target: 'es5', lib: ['es2015', 'dom'], jsx: 'react', module: 'commonjs' }
    }]
  },
  moduleNameMapper: {
    '^@microsoft/sp-http$': '<rootDir>/test/stubs/sp-http.ts',
    '^dompurify$': '<rootDir>/test/stubs/dompurify.ts',
    '^tinymce/.*$': '<rootDir>/test/stubs/empty.ts'
  }
};
