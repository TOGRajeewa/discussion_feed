// Standalone unit-test harness. Intentionally separate from `gulp test` (the SPFx
// 1.4.1 Karma chain) so it runs on a modern Node without the legacy toolchain.
// Heavy SPFx/native modules are stubbed via moduleNameMapper — we test our own logic.
module.exports = {
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,                 // transpile-only: don't typecheck SPFx imports
      tsconfig: { target: 'es5', lib: ['es2015', 'dom'], jsx: 'react', module: 'commonjs' }
    }]
  },
  moduleNameMapper: {
    '^@microsoft/sp-http$': '<rootDir>/../test/stubs/sp-http.ts',
    '^dompurify$': '<rootDir>/../test/stubs/dompurify.ts',
    '^tinymce/.*$': '<rootDir>/../test/stubs/empty.ts'
  }
};
