import { isValidBurstCount } from '../limits.js';
import type { ExpectationObservation } from '../types.js';
import type { ExpectationResult, FlowResult, LoopStep } from './loop-types.js';
import type { StepResult } from '../types.js';

export function actionBudgetCost(toolCall: { name: string; input: Record<string, unknown> }): number {
  if (toolCall.name !== 'burst') return 1;
  const count = toolCall.input.count;
  return isValidBurstCount(count) ? count : 1;
}

export const DEFAULT_CONTEXT_CHECKPOINT_ACTIONS = 8;
export const MODEL_SNAPSHOT_MAX_CHARS = 18_000;
export const CHECKPOINT_ACTIONS = 10;
export const CHECKPOINT_FLOW_SUMMARY_MAX_CHARS = 500;
export const MAX_EMPTY_FLOW_ENDINGS = 3;

export function actionLabel(name: string): string {
  const labels: Record<string, string> = {
    navigate: 'Navigate',
    click: 'Click',
    doubleClick: 'Double click',
    fill: 'Fill field',
    select: 'Select option',
    pressKey: 'Press key',
    check: 'Check option',
    uncheck: 'Uncheck option',
    hover: 'Hover element',
    dragAndDrop: 'Drag and drop',
    waitFor: 'Wait for element',
    reload: 'Reload page',
    goBack: 'Go back',
    goForward: 'Go forward',
    setViewportSize: 'Set viewport',
    download: 'Download file',
    verifyExpectation: 'Verify expectation',
  };
  return labels[name] ?? name;
}

export function actionFailureReason(error: string): string {
  if (/strict mode violation/i.test(error)) return 'the locator matched more than one element';
  if (/intercepts pointer events/i.test(error)) return 'another element blocked the interaction';
  if (/timeout/i.test(error)) return 'the target did not become available in time';
  return (error.split('\n')[0] ?? error).replace(/^locator\.[^:]+:\s*/i, '');
}

export function actionDescription(name: string, input: Record<string, unknown>): string {
  const label = actionLabel(name);
  if (name === 'setViewportSize') return `${label} to ${input.width}x${input.height}`;
  if (name === 'navigate') return `${label} to target page`;
  if (name === 'dragAndDrop') return `${label} ${input.source} -> ${input.target}`;
  if (typeof input.locator === 'string') return `${label} ${input.locator}`;
  return label;
}

export function aggregateExpectationResults(
  expectations: string[],
  observations: Array<ExpectationObservation & { flowIndex: number; historyIndex: number }>,
): ExpectationResult[] {
  return expectations.map((text, index) => {
    const matching = observations.filter((observation) => observation.expectationIndex === index + 1);
    const status = matching.some((observation) => observation.status === 'violated')
      ? 'violated'
      : matching.some((observation) => observation.status === 'met')
        ? 'met'
        : 'unknown';
    return { expectationIndex: index + 1, text, status, observations: matching };
  });
}

// Checks result *presence*, not field truthiness — a step with a real but empty snapshot must not be
// skipped; only a step with no result at all (an error) falls through to an earlier entry.
export function lastKnownUrl(history: LoopStep[], fallback: string): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const result = history[i]?.result;
    if (result) return result.url;
  }
  return fallback;
}

export function lastKnownSnapshot(history: LoopStep[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const result = history[i]?.result;
    if (result) return result.snapshot;
  }
  return '';
}

export function clipForCheckpoint(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;
  return `${value.slice(0, headChars)}\n...[snapshot clipped]...\n${value.slice(-tailChars)}`;
}

export function checkpointInput(
  history: LoopStep[],
  flowStartIndex: number,
  currentSnapshot: StepResult,
  flows: FlowResult[],
  remainingSteps: number,
): string {
  const recentActions = history
    .slice(Math.max(flowStartIndex, history.length - CHECKPOINT_ACTIONS))
    .map((step, index) => {
      const action = step.toolCall ? `${step.toolCall.name} ${JSON.stringify(step.toolCall.input)}` : '(no tool call)';
      const outcome = step.error ? `error: ${step.error}` : step.result ? `URL: ${step.result.url}` : 'no result';
      return `${index + 1}. ${clipForCheckpoint(action, 900)} -> ${clipForCheckpoint(outcome, 500)}`;
    })
    .join('\n');
  const completedFlows = flows
    .slice(-5)
    .map(
      (flow, index) =>
        `${index + 1}. ${clipForCheckpoint(flow.title ?? flow.finalText, CHECKPOINT_FLOW_SUMMARY_MAX_CHARS)}`,
    )
    .join('\n');

  return `Context checkpoint. Continue the same browser exploration from the current page; browser state and the action evidence are preserved. Do not repeat completed actions just because the conversation was compacted. Choose exactly one next tool call.

Completed flows:
${completedFlows || '(none)'}

Recent actions in the current flow:
${recentActions || '(none)'}

Current page:
URL: ${currentSnapshot.url}
  ${clipForCheckpoint(currentSnapshot.snapshot, MODEL_SNAPSHOT_MAX_CHARS)}

Remaining loop budget: ${remainingSteps} steps.`;
}

export function nextFlowInput(flows: FlowResult[], currentSnapshot: StepResult, remainingSteps: number): string {
  const completedFlows = flows
    .slice(-5)
    .map(
      (flow, index) =>
        `${index + 1}. ${clipForCheckpoint(flow.title ?? flow.finalText, CHECKPOINT_FLOW_SUMMARY_MAX_CHARS)}`,
    )
    .join('\n');
  return `A previous flow is complete. Start a genuinely different flow from the current starting page. Do not repeat a completed flow or its exact inputs. Choose exactly one next tool call.

Completed flows:
${completedFlows || '(none)'}

Current page:
URL: ${currentSnapshot.url}
${clipForCheckpoint(currentSnapshot.snapshot, MODEL_SNAPSHOT_MAX_CHARS)}

Remaining loop budget: ${remainingSteps} steps.`;
}
