/**
 * ESLint plugin for tenant security rules
 *
 * Prevents unsafe usage of Supabase service role that could bypass tenant isolation.
 */

const noUnsafeServiceRole = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct usage of SUPABASE_SERVICE_ROLE_KEY without tenant scoping',
      category: 'Security',
      recommended: true,
    },
    messages: {
      unsafeServiceRole: 'Direct service role usage detected. Use createTenantScopedServiceClient() or createUnrestrictedServiceClient() instead.',
      unsafeCreateClient: 'Creating Supabase client with service role key. Use createTenantScopedServiceClient() or createUnrestrictedServiceClient() wrappers instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      // Detect: process.env.SUPABASE_SERVICE_ROLE_KEY (but only when assigned/used, not existence checks)
      MemberExpression(node) {
        // Check for process.env.SUPABASE_SERVICE_ROLE_KEY
        if (
          node.object.type === 'MemberExpression' &&
          node.object.object.type === 'Identifier' &&
          node.object.object.name === 'process' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'env' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'SUPABASE_SERVICE_ROLE_KEY'
        ) {
          // Check if we're in approved service client wrapper files or infrastructure files
          const filename = context.getFilename();
          if (
            filename.includes('tenantScopedServiceClient') ||
            filename.includes('infrastructureServiceClient') ||
            filename.includes('middlewareServiceClient') ||
            filename.includes('lib/server/conversations.ts') ||
            filename.includes('lib/server/llm.ts') ||
            filename.includes('proxy.ts')
          ) {
            // Allow usage in the wrapper files and infrastructure initialization files
            return;
          }

          // Check if we're in a .env file or config file
          if (filename.includes('.env') || filename.includes('config')) {
            return;
          }

          // Allow simple existence checks (UnaryExpression with ! operator)
          const parent = node.parent;
          if (parent && parent.type === 'UnaryExpression' && parent.operator === '!') {
            return;
          }

          // Allow in if/while conditions that are just checking truthiness
          if (parent && parent.type === 'IfStatement' && parent.test === node) {
            return;
          }

          context.report({
            node,
            messageId: 'unsafeServiceRole',
          });
        }
      },

      // Detect: createClient(..., serviceRoleKey, ...) or createServerClient(..., serviceRoleKey, ...)
      CallExpression(node) {
        const filename = context.getFilename();

        // Allow usage in approved service client wrapper files
        if (
          filename.includes('tenantScopedServiceClient') ||
          filename.includes('infrastructureServiceClient') ||
          filename.includes('middlewareServiceClient')
        ) {
          return;
        }

        // Check for createClient or createServerClient calls
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'createClient' || node.callee.name === 'createServerClient')
        ) {
          // Check if second argument references SUPABASE_SERVICE_ROLE_KEY
          if (node.arguments.length >= 2) {
            const secondArg = node.arguments[1];

            // Check if it's a direct reference to service key variable
            if (
              secondArg.type === 'Identifier' &&
              (secondArg.name === 'supabaseServiceKey' ||
               secondArg.name === 'supabaseServiceRoleKey' ||
               secondArg.name === 'serviceRoleKey')
            ) {
              // Try to trace the variable to see if it's from SUPABASE_SERVICE_ROLE_KEY
              // For now, flag any usage of these variable names
              context.report({
                node,
                messageId: 'unsafeCreateClient',
              });
            }

            // Check if it's process.env.SUPABASE_SERVICE_ROLE_KEY
            if (
              secondArg.type === 'MemberExpression' &&
              secondArg.object.type === 'MemberExpression' &&
              secondArg.object.object.type === 'Identifier' &&
              secondArg.object.object.name === 'process' &&
              secondArg.object.property.type === 'Identifier' &&
              secondArg.object.property.name === 'env' &&
              secondArg.property.type === 'Identifier' &&
              secondArg.property.name === 'SUPABASE_SERVICE_ROLE_KEY'
            ) {
              context.report({
                node,
                messageId: 'unsafeCreateClient',
              });
            }
          }
        }
      },
    };
  },
};

export default {
  rules: {
    'no-unsafe-service-role': noUnsafeServiceRole,
  },
};
