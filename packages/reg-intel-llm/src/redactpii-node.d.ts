/**
 * Type declarations for @redactpii/node
 */
declare module '@redactpii/node' {
  export class Redactor {
    constructor();
    redact(text: string): string;
  }
}
