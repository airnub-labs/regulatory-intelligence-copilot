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
            'Direct session.run() calls are prohibited. Use GraphWriteService for all graph writes. See docs/architecture/guards/graph_ingress_guard_v_0_1.md',
        },
        {
          selector: "CallExpression[callee.name='executeCypher']",
          message:
            'Direct executeCypher() calls are prohibited. Use GraphWriteService for all graph writes. See docs/architecture/guards/graph_ingress_guard_v_0_1.md',
        },
        // ComplianceEngine Bypass Prevention (Phase 3 Architecture)
        {
          selector:
            "CallExpression[callee.object.name='llmRouter'][callee.property.name='streamChat']",
          message:
            'Direct llmRouter.streamChat() calls are prohibited in application code. Use ComplianceEngine.handleChatStream() to ensure proper agent routing and graph querying. See docs/architecture/archive/architecture_v_0_4.md',
        },
        {
          selector:
            "CallExpression[callee.object.name='llmRouter'][callee.property.name='chat']",
          message:
            'Direct llmRouter.chat() calls are prohibited in application code. Use ComplianceEngine.handleChat() to ensure proper agent routing and graph querying. See docs/architecture/archive/architecture_v_0_4.md',
        },
      ],
    },
  },

  // Application layer: Restrict direct LlmRouter imports
  {
    files: [
      'apps/demo-web/**/*.ts',
      'apps/demo-web/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@reg-copilot/reg-intel-llm',
          message:
            'Application layer should not import from reg-intel-llm directly. Use ComplianceEngine from reg-intel-core instead. This ensures proper agent routing and graph querying.',
        },
        {
          name: '@reg-copilot/reg-intel-llm',
          importNames: ['LlmRouter', 'createLlmRouter', 'createDefaultLlmRouter'],
          message:
            'Direct LlmRouter usage is prohibited in application code. Use ComplianceEngine.handleChat() or ComplianceEngine.handleChatStream() instead. See docs/architecture/archive/architecture_v_0_4.md',
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

  // Exemptions: LlmRouterClientAdapter can use llmRouter (it's the adapter layer)
  {
    files: [
      'packages/reg-intel-next-adapter/src/index.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Keep graph write restrictions, but allow llmRouter usage in adapter
        {
          selector:
            "CallExpression[callee.property.name='run'] > MemberExpression[object.name='session']",
          message:
            'Direct session.run() calls are prohibited. Use GraphWriteService for all graph writes.',
        },
        {
          selector: "CallExpression[callee.name='executeCypher']",
          message:
            'Direct executeCypher() calls are prohibited. Use GraphWriteService for all graph writes.',
        },
      ],
    },
  },

  // Warning only: Scripts with DELETE operations (not yet in GraphWriteService API)
  {
    files: ['scripts/test-graph-changes.ts', 'scripts/seed-graph.ts'],
    rules: {
      'no-restricted-syntax': 'warn',
    },
  },

  // Allow dynamic require() for optional peer dependencies
  {
    files: ['packages/reg-intel-llm/src/aiSdkProviders.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Optional peer deps use any
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
