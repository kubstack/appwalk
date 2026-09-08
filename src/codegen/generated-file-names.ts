// Filenames for sidecar artifacts codegen writes beside the generated spec. Kept separate from
// spec.ts and the templates/ helpers so both can reference them without a circular import.
export const GENERATED_CREDENTIALS_FILE = '.secrets.json';
export const GENERATED_STORAGE_STATE_FILE = '.storage-state.json';
// Per-flow, as opposed to GENERATED_STORAGE_STATE_FILE's single global one: a flow recorded after
// an earlier flow in the same persona run (e.g. one that already dismissed a consent banner or
// toggled a preference) needs that same browser storage to reach the page state it was actually
// verified against, not a blank one.
export const GENERATED_FLOW_STORAGE_STATE_PREFIX = '.storage-state.flow-';
