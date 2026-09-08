/** Runtime validation for a persisted discovery manifest. */

import {
  type ArtifactValidationIssue,
  arrayAt,
  enumValue,
  has,
  isRecord,
  issue,
  knownKeys,
  optionalInteger,
  optionalString,
  recordAt,
  requiredBoolean,
  requiredInteger,
  requiredString,
  requiredWebUrl,
  validateJsonValue,
  validateStringArray,
} from './validation-primitives.js';

const RESPONSE_ASSERTIONS = new Set(['visible', 'hidden', 'containsText', 'urlContains', 'urlEquals']);
const STOP_REASONS = new Set(['completed', 'agent_stopped', 'budget_exhausted', 'no_progress', 'error']);

function validateResponseFixture(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(object, new Set(['method', 'url', 'occurrence', 'urlPattern', 'status', 'body']), path, issues);
  requiredString(object, 'method', path, issues);
  requiredString(object, 'url', path, issues);
  optionalInteger(object, 'occurrence', path, issues, 1);
  optionalString(object, 'urlPattern', path, issues);
  requiredInteger(object, 'status', path, issues, 100);
  if (typeof object.status === 'number' && object.status > 599)
    issue(issues, `${path}.status`, 'must be an HTTP status integer between 100 and 599');
  if (!has(object, 'body')) issue(issues, `${path}.body`, 'is required');
  else validateJsonValue(object.body, `${path}.body`, issues);
}

function validateResponseVariant(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const object = recordAt(value, path, issues);
  if (!object) return;
  knownKeys(
    object,
    new Set(['name', 'sourceMethod', 'sourceUrl', 'sourceOccurrence', 'patches', 'expectation', 'reason']),
    path,
    issues,
  );
  requiredString(object, 'name', path, issues);
  optionalString(object, 'sourceMethod', path, issues);
  requiredString(object, 'sourceUrl', path, issues);
  optionalInteger(object, 'sourceOccurrence', path, issues, 1);
  optionalString(object, 'reason', path, issues);
  const patches = arrayAt(object.patches, `${path}.patches`, issues);
  patches?.forEach((patch, index) => {
    const itemPath = `${path}.patches[${index}]`;
    const item = recordAt(patch, itemPath, issues);
    if (!item) return;
    knownKeys(item, new Set(['path', 'value']), itemPath, issues);
    requiredString(item, 'path', itemPath, issues);
    if (!has(item, 'value')) issue(issues, `${itemPath}.value`, 'is required');
    else validateJsonValue(item.value, `${itemPath}.value`, issues);
  });
  const expectation = recordAt(object.expectation, `${path}.expectation`, issues);
  if (expectation) {
    knownKeys(expectation, new Set(['assertion', 'locator', 'value']), `${path}.expectation`, issues);
    enumValue(expectation, 'assertion', `${path}.expectation`, RESPONSE_ASSERTIONS, issues, true);
    optionalString(expectation, 'locator', `${path}.expectation`, issues);
    optionalString(expectation, 'value', `${path}.expectation`, issues);
  }
}

export function validateDiscoveryManifest(value: unknown): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const path = 'manifest';
  const manifest = recordAt(value, path, issues);
  if (!manifest) return issues;
  knownKeys(
    manifest,
    new Set(['version', 'executionId', 'url', 'createdAt', 'exhausted', 'setup', 'intent', 'runs', 'flows']),
    path,
    issues,
  );
  if (manifest.version !== 1 && manifest.version !== 2) issue(issues, `${path}.version`, 'must be 1 or 2');
  optionalString(manifest, 'executionId', path, issues);
  requiredWebUrl(manifest, 'url', path, issues);
  requiredString(manifest, 'createdAt', path, issues);
  requiredBoolean(manifest, 'exhausted', path, issues);

  const setup = recordAt(manifest.setup, `${path}.setup`, issues);
  if (setup) {
    knownKeys(setup, new Set(['requiresLogin', 'storageStatePath']), `${path}.setup`, issues);
    requiredBoolean(setup, 'requiresLogin', `${path}.setup`, issues);
    optionalString(setup, 'storageStatePath', `${path}.setup`, issues);
  }
  const intent = recordAt(manifest.intent, `${path}.intent`, issues);
  if (intent) {
    knownKeys(intent, new Set(['scope', 'expectations']), `${path}.intent`, issues);
    optionalString(intent, 'scope', `${path}.intent`, issues);
    validateStringArray(intent.expectations, `${path}.intent.expectations`, issues);
  }

  const runs = has(manifest, 'runs') ? arrayAt(manifest.runs, `${path}.runs`, issues) : undefined;
  const runIds = new Set<string>();
  runs?.forEach((run, index) => {
    const runPath = `${path}.runs[${index}]`;
    const item = recordAt(run, runPath, issues);
    if (!item) return;
    knownKeys(
      item,
      new Set([
        'id',
        'name',
        'persona',
        'personaIntent',
        'maxSteps',
        'scope',
        'expectations',
        'exhausted',
        'stopReason',
        'flowIds',
        'error',
      ]),
      runPath,
      issues,
    );
    requiredString(item, 'id', runPath, issues);
    if (typeof item.id === 'string') {
      if (runIds.has(item.id)) issue(issues, `${runPath}.id`, 'must be unique');
      runIds.add(item.id);
    }
    requiredString(item, 'name', runPath, issues);
    optionalString(item, 'persona', runPath, issues);
    enumValue(item, 'personaIntent', runPath, new Set(['journey', 'challenge']), issues);
    requiredInteger(item, 'maxSteps', runPath, issues, 1);
    optionalString(item, 'scope', runPath, issues);
    validateStringArray(item.expectations, `${runPath}.expectations`, issues);
    requiredBoolean(item, 'exhausted', runPath, issues);
    enumValue(item, 'stopReason', runPath, STOP_REASONS, issues);
    const flowIds = arrayAt(item.flowIds, `${runPath}.flowIds`, issues);
    flowIds?.forEach((flowId, flowIndex) => {
      if (typeof flowId !== 'number' || !Number.isSafeInteger(flowId) || flowId < 1)
        issue(issues, `${runPath}.flowIds[${flowIndex}]`, 'must be a positive safe integer');
    });
    optionalString(item, 'error', runPath, issues);
  });

  const flows = arrayAt(manifest.flows, `${path}.flows`, issues);
  const flowIds = new Set<number>();
  flows?.forEach((flow, index) => {
    const flowPath = `${path}.flows[${index}]`;
    const item = recordAt(flow, flowPath, issues);
    if (!item) return;
    knownKeys(
      item,
      new Set([
        'id',
        'runId',
        'runFlowIndex',
        'name',
        'title',
        'verified',
        'replayConfirmed',
        'startIndex',
        'endIndex',
        'startUrl',
        'responseFixtures',
        'origin',
        'sourceFlowId',
        'scenarioId',
        'responseVariant',
        'finding',
      ]),
      flowPath,
      issues,
    );
    requiredInteger(item, 'id', flowPath, issues, 1);
    if (typeof item.id === 'number') {
      if (flowIds.has(item.id)) issue(issues, `${flowPath}.id`, 'must be unique');
      flowIds.add(item.id);
    }
    optionalString(item, 'runId', flowPath, issues);
    optionalInteger(item, 'runFlowIndex', flowPath, issues, 0);
    requiredString(item, 'name', flowPath, issues);
    optionalString(item, 'title', flowPath, issues);
    requiredBoolean(item, 'verified', flowPath, issues);
    requiredBoolean(item, 'replayConfirmed', flowPath, issues);
    requiredInteger(item, 'startIndex', flowPath, issues, 0);
    requiredInteger(item, 'endIndex', flowPath, issues, 0);
    if (typeof item.startIndex === 'number' && typeof item.endIndex === 'number' && item.endIndex < item.startIndex)
      issue(issues, flowPath, 'endIndex must be >= startIndex');
    requiredWebUrl(item, 'startUrl', flowPath, issues);
    enumValue(item, 'origin', flowPath, new Set(['discovered', 'derived']), issues);
    optionalInteger(item, 'sourceFlowId', flowPath, issues, 1);
    optionalString(item, 'scenarioId', flowPath, issues);
    if (has(item, 'responseFixtures')) {
      const fixtures = arrayAt(item.responseFixtures, `${flowPath}.responseFixtures`, issues);
      fixtures?.forEach((fixture, fixtureIndex) =>
        validateResponseFixture(fixture, `${flowPath}.responseFixtures[${fixtureIndex}]`, issues),
      );
    }
    if (has(item, 'responseVariant'))
      validateResponseVariant(item.responseVariant, `${flowPath}.responseVariant`, issues);
    if (has(item, 'finding')) {
      const finding = recordAt(item.finding, `${flowPath}.finding`, issues);
      if (finding) {
        knownKeys(finding, new Set(['status', 'summary', 'failure']), `${flowPath}.finding`, issues);
        enumValue(finding, 'status', `${flowPath}.finding`, new Set(['confirmed', 'inconclusive']), issues, true);
        requiredString(finding, 'summary', `${flowPath}.finding`, issues);
        optionalString(finding, 'failure', `${flowPath}.finding`, issues);
      }
    }
    if (item.origin === 'derived' && (typeof item.sourceFlowId !== 'number' || typeof item.scenarioId !== 'string')) {
      issue(issues, flowPath, 'derived flow requires sourceFlowId and scenarioId');
    }
  });

  if (runs && flows) {
    const runIdSet = new Set(runs.flatMap((run) => (isRecord(run) && typeof run.id === 'string' ? [run.id] : [])));
    flows.forEach((flow, index) => {
      if (!isRecord(flow)) return;
      if (typeof flow.runId === 'string' && !runIdSet.has(flow.runId))
        issue(issues, `${path}.flows[${index}].runId`, 'must reference an existing run');
      if (typeof flow.sourceFlowId === 'number' && !flowIds.has(flow.sourceFlowId))
        issue(issues, `${path}.flows[${index}].sourceFlowId`, 'must reference an existing flow');
    });
    runs.forEach((run, index) => {
      if (!isRecord(run) || !Array.isArray(run.flowIds)) return;
      const seen = new Set<number>();
      run.flowIds.forEach((flowId, flowIndex) => {
        if (typeof flowId !== 'number') return;
        if (seen.has(flowId))
          issue(issues, `${path}.runs[${index}].flowIds[${flowIndex}]`, 'must be unique within the run');
        seen.add(flowId);
        if (!flowIds.has(flowId))
          issue(issues, `${path}.runs[${index}].flowIds[${flowIndex}]`, 'must reference an existing flow');
      });
    });
  }
  return issues;
}
