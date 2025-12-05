#!/usr/bin/env node
import { dumpObservabilityDiagnostics } from './diagnostics.js';

const command = process.argv[2];

if (!command || command === 'diagnostics' || command === 'dump') {
  dumpObservabilityDiagnostics();
  process.exit(0);
}

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`Usage: reg-intel-observability [diagnostics|dump]

Outputs the active OpenTelemetry configuration and exporter status.`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
