// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommended,

  // Global configuration
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },

  // Main rules for all TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Graph Write Discipline (D-026, D-028)
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='run'] > MemberExpression[object.name='session']",
          message:
            'Direct session.run() calls are prohibited. Use GraphWriteService for all graph writes. See docs/specs/graph_ingress_guard_v_0_1.md',
        },
        {
          selector: "CallExpression[callee.name='executeCypher']",
          message:
            'Direct executeCypher() calls are prohibited. Use GraphWriteService for all graph writes. See docs/specs/graph_ingress_guard_v_0_1.md',
        },
      ],
    },
  },

  // Exemptions: GraphWriteService and approved clients
  {
    files: [
      'packages/reg-intel-graph/src/graphWriteService.ts',
      'packages/reg-intel-graph/src/boltGraphClient.ts',
      'packages/reg-intel-core/src/graph/graphClient.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Warning only: test-graph-changes.ts (DELETE operations documented)
  {
    files: ['scripts/test-graph-changes.ts'],
    rules: {
      'no-restricted-syntax': 'warn',
    },
  },

  // Exemptions: Test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
    ],
  }
);
