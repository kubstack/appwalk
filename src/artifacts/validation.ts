/** Shared runtime validation for persisted discovery artifacts.
 *
 * Re-exports the split implementation (validation-primitives.ts, evidence-validation.ts,
 * manifest-validation.ts) so existing import sites don't need to change. */

export * from './validation-primitives.js';
export * from './evidence-validation.js';
export * from './manifest-validation.js';
