/**
 * Tool Registry for LLM Tool Integration
 *
 * Manages registration and execution of tools for LLM interactions.
 * Integrates with E2B sandboxes for code execution.
 */

import {
  executeCode,
  executeAnalysis,
  runCodeToolSchema,
  runAnalysisToolSchema,
  type E2BSandbox,
  type RunCodeInput,
  type RunAnalysisInput,
  type CodeExecutionResult,
  type AnalysisExecutionResult,
} from './codeExecutionTools.js';

// Type for Vercel AI SDK compatible tool
export interface AITool {
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

// =============================================================================
// Tool Registry Types
// =============================================================================

export interface ToolRegistryConfig {
  sandbox?: E2BSandbox;
  logger?: {
    info?: (msg: string, meta?: any) => void;
    error?: (msg: string, meta?: any) => void;
  };
  enableCodeExecution?: boolean;
}

export interface RegisteredTool {
  name: string;
  description: string;
  schema: any;
  execute: (args: any) => Promise<any>;
}

// =============================================================================
// Tool Registry Implementation
// =============================================================================

/**
 * Tool registry for managing LLM tools
 * Conditionally registers code execution tools based on sandbox availability
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = config;
    this.registerDefaultTools();
  }

  /**
   * Register default tools based on configuration
   */
  private registerDefaultTools(): void {
    // Register code execution tools if sandbox available and enabled
    if (this.config.sandbox && this.config.enableCodeExecution !== false) {
      this.registerCodeExecutionTools();
      this.config.logger?.info?.('[ToolRegistry] Code execution tools registered', {
        sandboxId: this.config.sandbox.sandboxId,
      });
    } else {
      this.config.logger?.info?.('[ToolRegistry] Code execution tools NOT registered', {
        hasSandbox: !!this.config.sandbox,
        enabled: this.config.enableCodeExecution,
      });
    }
  }

  /**
   * Register code execution tools
   */
  private registerCodeExecutionTools(): void {
    if (!this.config.sandbox) {
      throw new Error('Cannot register code execution tools without sandbox');
    }

    const sandbox = this.config.sandbox;
    const logger = this.config.logger;

    // Register run_code tool
    this.tools.set('run_code', {
      name: 'run_code',
      description: 'Execute code in an isolated sandbox environment. Supports Python, JavaScript, TypeScript, and Bash.',
      schema: runCodeToolSchema,
      execute: async (input: RunCodeInput): Promise<CodeExecutionResult> => {
        return executeCode(input, sandbox, logger);
      },
    });

    // Register run_analysis tool
    this.tools.set('run_analysis', {
      name: 'run_analysis',
      description: 'Execute predefined or custom analysis code (tax calculations, compliance checks, data analysis). Returns structured results.',
      schema: runAnalysisToolSchema,
      execute: async (input: RunAnalysisInput): Promise<AnalysisExecutionResult> => {
        return executeAnalysis(input, sandbox, logger);
      },
    });
  }

  /**
   * Get all registered tools in Vercel AI SDK format
   */
  getTools(): Record<string, AITool> {
    const tools: Record<string, AITool> = {};

    for (const [name, tool] of this.tools) {
      tools[name] = {
        description: tool.description,
        parameters: tool.schema,
        execute: tool.execute,
      };
    }

    return tools;
  }

  /**
   * Get specific tool by name
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get list of registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    this.config.logger?.info?.('[ToolRegistry] Executing tool', {
      name,
      argsKeys: Object.keys(args),
    });

    try {
      const result = await tool.execute(args);
      this.config.logger?.info?.('[ToolRegistry] Tool execution completed', {
        name,
        success: true,
      });
      return result;
    } catch (error) {
      this.config.logger?.error?.('[ToolRegistry] Tool execution failed', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update sandbox (useful for per-request sandbox switching)
   */
  updateSandbox(sandbox: E2BSandbox | undefined): void {
    const hadTools = this.tools.size > 0;
    this.tools.clear();
    this.config.sandbox = sandbox;
    this.registerDefaultTools();

    this.config.logger?.info?.('[ToolRegistry] Sandbox updated', {
      sandboxId: sandbox?.sandboxId,
      hadTools,
      hasTools: this.tools.size > 0,
    });
  }
}

/**
 * Create a tool registry with optional sandbox
 */
export function createToolRegistry(config: ToolRegistryConfig = {}): ToolRegistry {
  return new ToolRegistry(config);
}
