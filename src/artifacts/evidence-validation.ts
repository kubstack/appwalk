/** Runtime validation for evidence.jsonl entries. */

import {
  type ArtifactValidationIssue,
  arrayAt,
  enumValue,
  has,
  knownKeys,
  optionalBoolean,
  optionalInteger,
  optionalStatus,
  optionalString,
  recordAt,
  requiredInteger,
  requiredString,
  validateJsonValue,
} from './validation-primitives.js';

const EXPECTATION_ASSERTIONS = new Set([
  'visible',
  'hidden',
  'containsText',
  'urlContains',
  'urlEquals',
  'value',
  'checked',
  'unchecked',
  'disabled',
  'enabled',
  'count',
  'unknown',
]);
const RUNTIME_ERROR_KINDS = new Set(['console_error', 'page_error', 'request_failed', 'http_error', 'page_crash']);

function validateExpectation(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(
    object,
    new Set(['expectationIndex', 'status', 'assertion', 'locator', 'value', 'expectedCount', 'detail']),
    path,
    issues,
  );
  requiredInteger(object, 'expectationIndex', path, issues, 0);
  enumValue(object, 'status', path, new Set(['met', 'violated', 'unknown']), issues, true);
  enumValue(object, 'assertion', path, EXPECTATION_ASSERTIONS, issues, true);
  optionalString(object, 'locator', path, issues);
  optionalString(object, 'value', path, issues);
  optionalInteger(object, 'expectedCount', path, issues, 0);
  requiredString(object, 'detail', path, issues);
}

function validateStepResult(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(object, new Set(['url', 'snapshot', 'expectation']), path, issues);
  requiredString(object, 'url', path, issues);
  requiredString(object, 'snapshot', path, issues);
  if (has(object, 'expectation')) validateExpectation(object.expectation, `${path}.expectation`, issues);
}

function validateNetworkEntry(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(object, new Set(['method', 'url', 'status', 'body', 'bodyReadTimedOut']), path, issues);
  requiredString(object, 'method', path, issues);
  requiredString(object, 'url', path, issues);
  optionalStatus(object, 'status', path, issues);
  optionalBoolean(object, 'bodyReadTimedOut', path, issues);
  if (has(object, 'body')) validateJsonValue(object.body, `${path}.body`, issues);
}

function validateRuntimeError(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(
    object,
    new Set(['kind', 'message', 'method', 'url', 'status', 'safetyRelated', 'lifecycle']),
    path,
    issues,
  );
  enumValue(object, 'kind', path, RUNTIME_ERROR_KINDS, issues, true);
  requiredString(object, 'message', path, issues);
  optionalString(object, 'method', path, issues);
  optionalString(object, 'url', path, issues);
  optionalStatus(object, 'status', path, issues);
  optionalBoolean(object, 'safetyRelated', path, issues);
  optionalBoolean(object, 'lifecycle', path, issues);
}

export function validateEvidenceEntry(value: unknown, line: number): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const path = `evidence line ${line}`;
  const object = recordAt(value, path, issues);
  if (!object) return issues;
  knownKeys(
    object,
    new Set([
      'index',
      'flowIndex',
      'runId',
      'scenarioId',
      'origin',
      'timestamp',
      'toolCall',
      'result',
      'error',
      'finalText',
      'network',
      'console',
      'runtimeErrors',
      'safetyBlocked',
      'webSocketFrames',
    ]),
    path,
    issues,
  );
  requiredInteger(object, 'index', path, issues, 0);
  requiredInteger(object, 'flowIndex', path, issues, 0);
  optionalString(object, 'runId', path, issues);
  optionalString(object, 'scenarioId', path, issues);
  enumValue(object, 'origin', path, new Set(['discovered', 'derived']), issues);
  requiredString(object, 'timestamp', path, issues);
  optionalString(object, 'error', path, issues);
  optionalString(object, 'finalText', path, issues);
  optionalInteger(object, 'safetyBlocked', path, issues, 0);

  const toolCall = has(object, 'toolCall') ? recordAt(object.toolCall, `${path}.toolCall`, issues) : undefined;
  if (toolCall) {
    knownKeys(toolCall, new Set(['name', 'input']), `${path}.toolCall`, issues);
    requiredString(toolCall, 'name', `${path}.toolCall`, issues);
    const input = recordAt(toolCall.input, `${path}.toolCall.input`, issues);
    if (input) validateJsonValue(input, `${path}.toolCall.input`, issues);
  }
  if (has(object, 'result')) validateStepResult(object.result, `${path}.result`, issues);
  const network = arrayAt(object.network, `${path}.network`, issues);
  network?.forEach((entry, index) => validateNetworkEntry(entry, `${path}.network[${index}]`, issues));
  const consoleEntries = arrayAt(object.console, `${path}.console`, issues);
  consoleEntries?.forEach((entry, index) => {
    const item = recordAt(entry, `${path}.console[${index}]`, issues);
    if (!item) return;
    knownKeys(item, new Set(['type', 'text']), `${path}.console[${index}]`, issues);
    requiredString(item, 'type', `${path}.console[${index}]`, issues);
    requiredString(item, 'text', `${path}.console[${index}]`, issues);
  });
  const runtimeErrors = has(object, 'runtimeErrors')
    ? arrayAt(object.runtimeErrors, `${path}.runtimeErrors`, issues)
    : undefined;
  runtimeErrors?.forEach((entry, index) => validateRuntimeError(entry, `${path}.runtimeErrors[${index}]`, issues));
  const frames = has(object, 'webSocketFrames')
    ? arrayAt(object.webSocketFrames, `${path}.webSocketFrames`, issues)
    : undefined;
  frames?.forEach((entry, index) => {
    const item = recordAt(entry, `${path}.webSocketFrames[${index}]`, issues);
    if (!item) return;
    knownKeys(item, new Set(['url', 'direction', 'payload']), `${path}.webSocketFrames[${index}]`, issues);
    requiredString(item, 'url', `${path}.webSocketFrames[${index}]`, issues);
    enumValue(item, 'direction', `${path}.webSocketFrames[${index}]`, new Set(['sent', 'received']), issues, true);
    requiredString(item, 'payload', `${path}.webSocketFrames[${index}]`, issues);
  });
  return issues;
}
