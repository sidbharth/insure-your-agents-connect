import tseslint from 'typescript-eslint';

/**
 * Plan §12: all time-dependent logic must read the virtual demo clock
 * (`lib/demoClock.ts`), never Date.now() / new Date() directly — otherwise
 * presenter fast-forward silently breaks clocks and pro-ration.
 */
const bannedDateSyntax = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Use demoNow()/demoNowDate() from lib/demoClock.ts — Date.now() ignores the presenter time offset.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Use demoNowDate() from lib/demoClock.ts — `new Date()` ignores the presenter time offset.',
  },
];

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...bannedDateSyntax],
      // `_`-prefixed params are the sanctioned form for the frozen WP-1 stub
      // signatures (bodies throw until WP-1 fills them in).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The single sanctioned reader of the real clock.
    files: ['src/lib/demoClock.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Tests may construct fixed dates / fake timers freely.
    files: ['src/**/__tests__/**', 'test/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
