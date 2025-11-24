import { sanitizeObjectForEgress } from '../aspects/egressGuard.js';
import type { EgressGuard } from './types.js';

export class BasicEgressGuard implements EgressGuard {
  redact<T>(input: T): T {
    return sanitizeObjectForEgress(input);
  }
}
