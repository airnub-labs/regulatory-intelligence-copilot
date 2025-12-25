#!/usr/bin/env tsx
/**
 * Script to update implementation state for E2B execution context feature
 *
 * Usage:
 *   pnpm tsx scripts/update-implementation-state.ts complete 1.1.1
 *   pnpm tsx scripts/update-implementation-state.ts start 1.2.1
 *   pnpm tsx scripts/update-implementation-state.ts block phase1 "Missing E2B API key"
 *   pnpm tsx scripts/update-implementation-state.ts note "Completed database migration"
 *   pnpm tsx scripts/update-implementation-state.ts status
 */

import fs from 'fs';
import path from 'path';

interface TestResults {
  unit: {
    passed: number;
    failed: number;
    coverage: string;
  };
  integration: {
    passed: number;
    failed: number;
  };
  e2e: Record<string, 'not_run' | 'passed' | 'failed'>;
}

interface Phase {
  name: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  completedTasks: string[];
  currentTask: string | null;
  blockers: string[];
  tasks: Record<string, string>;
}

interface Milestones {
  phase1Complete: string | null;
  phase2Complete: string | null;
  phase3Complete: string | null;
  phase4Complete: string | null;
  productionReady: string | null;
}

interface ImplementationState {
  version: string;
  lastUpdated: string;
  phases: Record<string, Phase>;
  overallProgress: string;
  totalTasks: number;
  completedTaskCount: number;
  notes: string[];
  milestones: Milestones;
  testResults: TestResults;
}

const STATE_FILE = path.join(__dirname, '../docs/architecture/execution-context/IMPLEMENTATION_STATE.json');

const fail = (message: string): never => {
  throw new Error(message);
};

function loadState(): ImplementationState {
  if (!fs.existsSync(STATE_FILE)) {
    fail(`State file not found: ${STATE_FILE}`);
  }

  const content = fs.readFileSync(STATE_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveState(state: ImplementationState): void {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  console.log('✅ State updated:', STATE_FILE);
}

function calculateProgress(state: ImplementationState): void {
  let totalTasks = 0;
  let completedTasks = 0;

  Object.values(state.phases).forEach(phase => {
    const phaseTasks = Object.keys(phase.tasks).length;
    totalTasks += phaseTasks;
    completedTasks += phase.completedTasks.length;
  });

  state.totalTasks = totalTasks;
  state.completedTaskCount = completedTasks;
  state.overallProgress = totalTasks > 0 ? `${Math.round((completedTasks / totalTasks) * 100)}%` : '0%';
}

function updatePhaseStatus(state: ImplementationState, phaseKey: string): void {
  const phase = state.phases[phaseKey];
  if (!phase) return;

  const totalPhaseTasks = Object.keys(phase.tasks).length;
  const completedPhaseTasks = phase.completedTasks.length;

  if (completedPhaseTasks === totalPhaseTasks) {
    phase.status = 'completed';
    phase.currentTask = null;

    // Update milestone
    const milestoneKey = `${phaseKey}Complete` as keyof Milestones;
    if (!state.milestones[milestoneKey]) {
      state.milestones[milestoneKey] = new Date().toISOString();
    }

    console.log(`🎉 Phase ${phaseKey} completed!`);
  } else if (completedPhaseTasks > 0 || phase.currentTask) {
    if (phase.blockers.length > 0) {
      phase.status = 'blocked';
    } else {
      phase.status = 'in_progress';
    }
  } else {
    phase.status = 'not_started';
  }
}

function getPhaseFromTaskId(taskId: string): string {
  const phaseNum = taskId.split('.')[0];
  return `phase${phaseNum}`;
}

function completeTask(state: ImplementationState, taskId: string): void {
  const phaseKey = getPhaseFromTaskId(taskId);
  const phase = state.phases[phaseKey];

  if (!phase) {
    fail(`Phase not found for task ${taskId}`);
  }

  if (!phase.tasks[taskId]) {
    fail(`Task ${taskId} not found in ${phaseKey}`);
  }

  if (phase.completedTasks.includes(taskId)) {
    console.warn(`⚠️  Task ${taskId} already completed`);
    return;
  }

  phase.completedTasks.push(taskId);

  // Clear current task if it's this one
  if (phase.currentTask === taskId) {
    phase.currentTask = null;
  }

  updatePhaseStatus(state, phaseKey);
  calculateProgress(state);

  console.log(`✅ Completed task ${taskId}: ${phase.tasks[taskId]}`);
  console.log(`📊 Phase progress: ${phase.completedTasks.length}/${Object.keys(phase.tasks).length}`);
}

function startTask(state: ImplementationState, taskId: string): void {
  const phaseKey = getPhaseFromTaskId(taskId);
  const phase = state.phases[phaseKey];

  if (!phase) {
    fail(`Phase not found for task ${taskId}`);
  }

  if (!phase.tasks[taskId]) {
    fail(`Task ${taskId} not found in ${phaseKey}`);
  }

  if (phase.completedTasks.includes(taskId)) {
    console.warn(`⚠️  Task ${taskId} already completed`);
    return;
  }

  phase.currentTask = taskId;
  updatePhaseStatus(state, phaseKey);

  console.log(`🚀 Started task ${taskId}: ${phase.tasks[taskId]}`);
}

function blockPhase(state: ImplementationState, phaseKey: string, blocker: string): void {
  const phase = state.phases[phaseKey];

  if (!phase) {
    fail(`Phase ${phaseKey} not found`);
  }

  phase.blockers.push(blocker);
  phase.status = 'blocked';

  console.log(`🚫 Blocked ${phaseKey}: ${blocker}`);
}

function unblockPhase(state: ImplementationState, phaseKey: string, blocker?: string): void {
  const phase = state.phases[phaseKey];

  if (!phase) {
    fail(`Phase ${phaseKey} not found`);
  }

  if (blocker) {
    phase.blockers = phase.blockers.filter(b => b !== blocker);
  } else {
    phase.blockers = [];
  }

  updatePhaseStatus(state, phaseKey);

  console.log(`✅ Unblocked ${phaseKey}`);
}

function addNote(state: ImplementationState, note: string): void {
  const timestamp = new Date().toISOString();
  state.notes.push(`[${timestamp}] ${note}`);

  console.log(`📝 Added note: ${note}`);
}

function showStatus(state: ImplementationState): void {
  console.log('\n📊 E2B Execution Context Implementation Status\n');
  console.log(`Version: ${state.version}`);
  console.log(`Last Updated: ${state.lastUpdated}`);
  console.log(`Overall Progress: ${state.overallProgress} (${state.completedTaskCount}/${state.totalTasks} tasks)\n`);

  Object.entries(state.phases).forEach(([key, phase]) => {
    const statusIcon =
      phase.status === 'completed' ? '✅' :
      phase.status === 'in_progress' ? '🚧' :
      phase.status === 'blocked' ? '🚫' :
      '⏸️';

    console.log(`${statusIcon} ${phase.name} (${phase.status})`);
    console.log(`   Progress: ${phase.completedTasks.length}/${Object.keys(phase.tasks).length} tasks`);

    if (phase.currentTask) {
      console.log(`   Current: ${phase.currentTask} - ${phase.tasks[phase.currentTask]}`);
    }

    if (phase.blockers.length > 0) {
      console.log(`   ⚠️  Blockers:`);
      phase.blockers.forEach(blocker => {
        console.log(`      - ${blocker}`);
      });
    }

    console.log('');
  });

  console.log('🏁 Milestones:');
  Object.entries(state.milestones).forEach(([key, value]) => {
    const icon = value ? '✅' : '⏳';
    console.log(`   ${icon} ${key}: ${value ?? 'Not reached'}`);
  });

  console.log('\n🧪 Test Results:');
  console.log(`   Unit Tests: ${state.testResults.unit.passed} passed, ${state.testResults.unit.failed} failed (${state.testResults.unit.coverage} coverage)`);
  console.log(`   Integration Tests: ${state.testResults.integration.passed} passed, ${state.testResults.integration.failed} failed`);
  console.log(`   E2E Tests:`);
  Object.entries(state.testResults.e2e).forEach(([test, result]) => {
    const icon =
      result === 'passed' ? '✅' :
      result === 'failed' ? '❌' :
      '⏳';
    console.log(`      ${icon} ${test}: ${result}`);
  });

  if (state.notes.length > 0) {
    console.log('\n📝 Recent Notes (last 5):');
    state.notes.slice(-5).forEach(note => {
      console.log(`   ${note}`);
    });
  }

  console.log('');
}

function updateTests(state: ImplementationState, type: 'unit' | 'integration', passed: number, failed: number, coverage?: string): void {
  if (type === 'unit') {
    state.testResults.unit.passed = passed;
    state.testResults.unit.failed = failed;
    if (coverage) {
      state.testResults.unit.coverage = coverage;
    }
    console.log(`🧪 Updated unit test results: ${passed} passed, ${failed} failed`);
  } else if (type === 'integration') {
    state.testResults.integration.passed = passed;
    state.testResults.integration.failed = failed;
    console.log(`🧪 Updated integration test results: ${passed} passed, ${failed} failed`);
  }
}

function updateE2ETest(state: ImplementationState, testName: string, result: 'passed' | 'failed'): void {
  if (testName in state.testResults.e2e) {
    state.testResults.e2e[testName] = result;
    console.log(`🧪 E2E test ${testName}: ${result}`);
  } else {
    fail(`E2E test ${testName} not found`);
  }
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0];

await runWithScriptObservability(
  'update-implementation-state',
  async () => {
    if (!command) {
      console.log(`
Usage:
  pnpm tsx scripts/update-implementation-state.ts <command> [args...]

Commands:
  complete <taskId>              Mark task as completed (e.g., "1.1.1")
  start <taskId>                 Mark task as started
  block <phaseKey> <reason>      Block a phase (e.g., "phase1" "Missing API key")
  unblock <phaseKey> [reason]    Unblock a phase
  note <message>                 Add a timestamped note
  status                         Show current status
  test:unit <passed> <failed> [coverage]     Update unit test results
  test:integration <passed> <failed>         Update integration test results
  test:e2e <testName> <result>               Update E2E test result (passed/failed)

Examples:
  pnpm tsx scripts/update-implementation-state.ts complete 1.1.1
  pnpm tsx scripts/update-implementation-state.ts start 1.2.1
  pnpm tsx scripts/update-implementation-state.ts block phase1 "Missing E2B API key"
  pnpm tsx scripts/update-implementation-state.ts unblock phase1
  pnpm tsx scripts/update-implementation-state.ts note "Completed database setup"
  pnpm tsx scripts/update-implementation-state.ts status
  pnpm tsx scripts/update-implementation-state.ts test:unit 42 0 85%
  pnpm tsx scripts/update-implementation-state.ts test:e2e test1_basic_execution passed
  `);
      return;
    }

    const state = loadState();

    switch (command) {
      case 'complete':
        if (!args[1]) {
          fail('Task ID required');
        }
        completeTask(state, args[1]);
        saveState(state);
        break;

      case 'start':
        if (!args[1]) {
          fail('Task ID required');
        }
        startTask(state, args[1]);
        saveState(state);
        break;

      case 'block':
        if (!args[1] || !args[2]) {
          fail('Phase key and blocker reason required');
        }
        blockPhase(state, args[1], args.slice(2).join(' '));
        saveState(state);
        break;

      case 'unblock':
        if (!args[1]) {
          fail('Phase key required');
        }
        unblockPhase(state, args[1], args[2]);
        saveState(state);
        break;

      case 'note':
        if (!args[1]) {
          fail('Note message required');
        }
        addNote(state, args.slice(1).join(' '));
        saveState(state);
        break;

      case 'status':
        showStatus(state);
        break;

      case 'test:unit':
        if (!args[1] || !args[2]) {
          fail('Passed and failed counts required');
        }
        updateTests(state, 'unit', parseInt(args[1]), parseInt(args[2]), args[3]);
        saveState(state);
        break;

      case 'test:integration':
        if (!args[1] || !args[2]) {
          fail('Passed and failed counts required');
        }
        updateTests(state, 'integration', parseInt(args[1]), parseInt(args[2]));
        saveState(state);
        break;

      case 'test:e2e':
        if (!args[1] || !args[2]) {
          fail('Test name and result (passed/failed) required');
        }
        if (args[2] !== 'passed' && args[2] !== 'failed') {
          fail('Result must be "passed" or "failed"');
        }
        updateE2ETest(state, args[1], args[2]);
        saveState(state);
        break;

      default:
        fail(`Unknown command: ${command}`);
    }
  },
  { agentId: 'update-implementation-state' }
);
