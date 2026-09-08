import type { Page } from 'playwright';
import { type BrowserLifecycle, type BrowserRestartHooks } from '../browser/actions.js';
import { captureScreenshot, toStepResult } from '../browser/snapshot.js';
import type { EvidenceRecorder, NetworkEntry } from '../evidence/recorder.js';
import type { LlmProvider } from '../providers/provider.js';
import type { ExpectationObservation, StepResult } from '../types.js';
import type { Logger } from '../logging/logger.js';
import type { Persona } from './personas.js';
import { executeToolCall, TOOL_DEFINITIONS } from './tools.js';
import { validateToolInput } from './validation.js';
import type { TabRegistryHandle } from './tools.js';
import type { VerificationMode } from './verification.js';
import { verifyFlow } from './verification.js';
import { defaultRedactor, type Redactor } from '../security/redaction.js';
import type { SafetyRequestOptions } from '../safety/guard.js';
import { buildSystemPrompt } from './system-prompt.js';
import type { FlowResult, LoopResult, LoopStep } from './loop-types.js';
import {
  actionBudgetCost,
  actionDescription,
  actionFailureReason,
  actionLabel,
  aggregateExpectationResults,
  checkpointInput,
  clipForCheckpoint,
  DEFAULT_CONTEXT_CHECKPOINT_ACTIONS,
  lastKnownSnapshot,
  lastKnownUrl,
  MAX_EMPTY_FLOW_ENDINGS,
  MODEL_SNAPSHOT_MAX_CHARS,
  nextFlowInput,
} from './loop-helpers.js';

export { buildSystemPrompt } from './system-prompt.js';
export type { ExpectationResult, FlowResult, LoopResult, LoopStep, LoopStopReason } from './loop-types.js';

export async function runAgentLoop(
  page: Page,
  provider: LlmProvider,
  options: {
    maxSteps: number;
    onStep?: (step: LoopStep, index: number, flowIndex: number) => void;
    /** Optional — when given, the completion heuristic also checks for a 2xx on a recent state-changing request, not just the URL. */
    recorder?: EvidenceRecorder;
    /** Also capture a screenshot after every step, for providers that support vision. */
    captureScreenshots?: boolean;
    /** Which verification mode to apply to every flow in this session. Ignored if `persona` is given (the persona's own mode wins). Defaults to `completion`. */
    verificationMode?: VerificationMode;
    /** Overrides the default exploration goal with a specific persona's — also determines the verification mode unless overridden by `verificationMode` directly. */
    persona?: Persona;
    /** Optional natural-language exploration objective. It guides navigation but is not a hard route boundary. */
    scope?: string;
    /** User-defined acceptance criteria to check within the scope. */
    expectations?: string[];
    /** Rebuild the provider context after this many tool actions. Set to 0 to disable. */
    contextCheckpointActions?: number;
    /** Returns the number of safety-blocked requests observed by the active browser session. */
    getSafetyBlockCount?: () => number;
    /** Called whenever a tool switches the active page (a new tab, a reopened browser) — the
     * caller re-applies whatever is page-scoped and doesn't follow a page switch on its own,
     * such as the destructive-action safety guard (`page.route`, not `context`-wide). */
    onActivePageChange?: (page: Page) => Promise<void>;
    /** Called immediately before and after `reopenBrowser` replaces the browser context. */
    browserRestartHooks?: BrowserRestartHooks;
    /** Owns creation and preparation of every replacement context/page in this run. */
    browserLifecycle?: BrowserLifecycle;
    /** Kept pointed at whichever tab registry is current for the flow in progress, so a popup
     * listener attached outside this function (see attachPopupDetection) can register a tab the
     * target app opens on its own, making it reachable via switchTab like an agent-opened tab. */
    tabRegistryHandle?: TabRegistryHandle;
    /** Shared policy for browser state retained in agent history or sent to a provider. */
    redactor?: Redactor;
    /** Cancels the active provider request and any rate-limit backoff. */
    signal?: AbortSignal;
    /** The same request safety policy used by the browser guard, including direct apiRequest calls. */
    safety?: SafetyRequestOptions;
    logger?: Logger;
  },
): Promise<LoopResult> {
  const mode: VerificationMode | VerificationMode[] =
    options.persona?.verificationMode ?? options.verificationMode ?? 'completion';
  const history: LoopStep[] = [];
  const flows: FlowResult[] = [];
  const initialUrl = page.url();
  const redactor = options.redactor ?? defaultRedactor;

  const initialSnapshot = await toStepResult(page, redactor);
  const initialScreenshot = options.captureScreenshots
    ? await captureScreenshot(page, { maskInputs: true })
    : undefined;
  const expectationObservations: Array<ExpectationObservation & { flowIndex: number; historyIndex: number }> = [];
  const systemPrompt = () =>
    buildSystemPrompt(
      options.maxSteps,
      Boolean(options.captureScreenshots),
      options.persona,
      options.scope,
      options.expectations,
    );

  let turn = await provider.start({
    systemPrompt: systemPrompt(),
    tools: TOOL_DEFINITIONS,
    initialInput: `Current page:\nURL: ${initialSnapshot.url}\n${clipForCheckpoint(initialSnapshot.snapshot, MODEL_SNAPSHOT_MAX_CHARS)}`,
    screenshot: initialScreenshot,
    signal: options.signal,
  });
  options.logger?.debug('agent.turn_started', 'Agent context started', { flowIndex: 0, actionCount: 0 });

  let flowIndex = 0;
  let flowStartIndex = 0;
  let flowNetworkStart = options.recorder?.network.length ?? 0;
  let flowRuntimeErrorStart = options.recorder?.runtimeErrors.length ?? 0;
  // Network activity from this flow's `burst` step(s) specifically — see `looksLikeStability`'s
  // comment in verification.ts for why `stability` mode needs this narrower scope instead of the
  // whole flow's network.
  let flowBurstNetwork: NetworkEntry[] = [];
  let flowStartUrl = initialSnapshot.url;
  let flowStartSnapshot = initialSnapshot.snapshot;
  let flowStartStorageState = JSON.stringify(await page.context().storageState({ indexedDB: true }));
  // Reset at the start of every flow (below) so tab ids stay predictable ("tab-0" is always the flow's
  // starting page) and a flow never sees a tab left open by a previous, independent flow. Kept behind
  // a stable handle (not a plain local) so attachPopupDetection, wired up before this function was
  // even called, can register a self-opened popup into whichever registry is current right now.
  const tabRegistryHandle: TabRegistryHandle = options.tabRegistryHandle ?? { tabs: new Map() };
  tabRegistryHandle.tabs = new Map([['tab-0', page]]);
  let actionCount = 0;
  let flowActionStartCount = 0;
  let emptyFlowEndings = 0;
  options.logger?.phase(`Exploring flow ${flowIndex + 1}`);

  while (true) {
    const isFlowCompleteTool = turn.type === 'tool_call' && turn.toolCall.name === 'flowComplete';

    if (turn.type === 'text') {
      // An empty turn.text (e.g. the model's final reply when the budget ran out mid-turn) must
      // stay undefined, not '' — evidence.jsonl itself requires finalText to be non-empty when
      // present, and `flow.title ?? flow.finalText` elsewhere would otherwise resolve to '' instead
      // of falling through, since `??` treats an empty string as present.
      const finalText = turn.text.trim() ? redactor.text(turn.text) : undefined;
      const stopStep: LoopStep = { finalText, result: await toStepResult(page, redactor) };
      history.push(stopStep);
      options.onStep?.(stopStep, history.length - 1, flowIndex);
      options.logger?.warn(
        actionCount >= options.maxSteps
          ? `    Exploration reached the action budget before the next flow was completed; retained ${flows.length} completed flow(s)`
          : flows.length > 0
            ? `    Exploration ended before the next flow was completed; retained ${flows.length} completed flow(s)`
            : '    Exploration stopped before completing a flow',
      );
      options.logger?.debug('exploration.agent_stopped', 'Agent returned text without calling flowComplete', {
        flowIndex,
        actionCount,
        exhausted: actionCount >= options.maxSteps,
      });
      return {
        history,
        flows,
        exhausted: actionCount >= options.maxSteps,
        stopReason: actionCount >= options.maxSteps ? 'budget_exhausted' : 'agent_stopped',
        expectationResults: aggregateExpectationResults(options.expectations ?? [], expectationObservations),
        finalPage: page,
      };
    }

    if (isFlowCompleteTool) {
      const definition = TOOL_DEFINITIONS.find((tool) => tool.name === 'flowComplete')!;
      let completionInput: Record<string, unknown>;
      try {
        completionInput = validateToolInput(definition, turn.toolCall.input);
      } catch (error) {
        const message = (error as Error).message;
        options.logger?.debug('agent.tool_call_invalid', 'Agent returned invalid flow completion input', {
          error: message,
        });
        turn = await provider.continue(
          {
            toolCallId: turn.toolCall.id,
            toolName: turn.toolCall.name,
            result: `Error: ${message}`,
          },
          { signal: options.signal },
        );
        continue;
      }
      const finalText = completionInput.summary as string;
      const title = typeof completionInput.title === 'string' ? completionInput.title : undefined;
      const currentState = await toStepResult(page, redactor);

      const step: LoopStep = { finalText, result: currentState };
      if (isFlowCompleteTool && turn.type === 'tool_call') {
        step.toolCall = { name: turn.toolCall.name, input: completionInput };
      }
      history.push(step);
      options.onStep?.(step, history.length - 1, flowIndex);

      const flowHistory = history.slice(flowStartIndex);
      // Verification reads state from the last *real* action, not the ending step's own fresh capture
      // above — the gap between them is a full LLM round-trip of real wall-clock time, long enough for
      // a delayed client-side redirect/effect to complete and silently erase signal (e.g. an inline
      // error message) that was genuinely present right after the action itself.
      const actionHistory = flowHistory.slice(0, -1);
      const url = lastKnownUrl(actionHistory, initialUrl);
      const snapshot = lastKnownSnapshot(actionHistory);
      const network = options.recorder?.network.slice(flowNetworkStart) ?? [];
      // A zero-action ending has nothing to verify — otherwise `preservation` mode (Blake) would
      // trivially pass a no-op as "nothing changed".
      //
      // `coreActionTypes`, when set, gates the same way: rendered content alone can't prove the
      // persona's defining action happened, since apps render rejection/error states differently.
      const hasCoreAction =
        !options.persona?.coreActionTypes ||
        actionHistory.some((step) => step.toolCall && options.persona!.coreActionTypes!.includes(step.toolCall.name));
      const verified =
        flowHistory.length > 1 &&
        hasCoreAction &&
        verifyFlow(mode, {
          flowStartUrl,
          flowStartSnapshot,
          finalUrl: url,
          finalSnapshot: snapshot,
          network,
          burstNetwork: flowBurstNetwork,
          snapshots: actionHistory.flatMap((step) => (step.result?.snapshot ? [step.result.snapshot] : [])),
          runtimeErrors: options.recorder?.runtimeErrors.slice(flowRuntimeErrorStart) ?? [],
          expectations: actionHistory.flatMap((step) => (step.result?.expectation ? [step.result.expectation] : [])),
        });

      flows.push({
        startIndex: flowStartIndex,
        endIndex: history.length - 1,
        finalText,
        title,
        verified,
        startUrl: flowStartUrl,
        startStorageState: flowStartStorageState,
      });
      options.logger?.success(`Flow ${flows.length} discovered${title ? `: ${title}` : ''}`);
      options.logger?.debug('flow.completed', 'Agent completed a flow', {
        flowIndex,
        verified,
        actions: actionHistory.length,
        startUrl: flowStartUrl,
        finalUrl: url,
      });

      if (actionCount === flowActionStartCount) {
        emptyFlowEndings += 1;
        if (emptyFlowEndings >= MAX_EMPTY_FLOW_ENDINGS) {
          return {
            history,
            flows,
            exhausted: false,
            stopReason: 'no_progress',
            expectationResults: aggregateExpectationResults(options.expectations ?? [], expectationObservations),
            finalPage: page,
          };
        }
      } else {
        emptyFlowEndings = 0;
      }

      const stepsRemaining = options.maxSteps - actionCount;

      // Leftover budget after a flow ending must not just go unused. A new provider context keeps
      // the next flow independent from the completed one while the browser session is still reused.
      if (stepsRemaining > 0) {
        await page.goto(initialUrl);
        const restartSnapshot = await toStepResult(page, redactor);
        const restartScreenshot = options.captureScreenshots
          ? await captureScreenshot(page, { maskInputs: true })
          : undefined;

        flowIndex += 1;
        flowStartIndex = history.length;
        flowNetworkStart = options.recorder?.network.length ?? 0;
        flowRuntimeErrorStart = options.recorder?.runtimeErrors.length ?? 0;
        flowBurstNetwork = [];
        flowStartUrl = restartSnapshot.url;
        flowStartSnapshot = restartSnapshot.snapshot;
        flowStartStorageState = JSON.stringify(await page.context().storageState({ indexedDB: true }));
        tabRegistryHandle.tabs = new Map([['tab-0', page]]);
        flowActionStartCount = actionCount;

        turn = await provider.start({
          systemPrompt: systemPrompt(),
          tools: TOOL_DEFINITIONS,
          initialInput: nextFlowInput(flows, restartSnapshot, stepsRemaining),
          screenshot: restartScreenshot,
          signal: options.signal,
        });
        options.logger?.phase(`Exploring flow ${flowIndex + 1}`);
        options.logger?.debug('agent.turn_started', 'New agent context started for the next flow', {
          flowIndex,
          remainingSteps: stepsRemaining,
        });
        continue;
      }

      return {
        history,
        flows,
        exhausted: false,
        stopReason: 'completed',
        expectationResults: aggregateExpectationResults(options.expectations ?? [], expectationObservations),
        finalPage: page,
      };
    }

    // A final provider turn may still classify the last observed browser state as a
    // completed flow, but it must never be allowed to execute another browser action.
    if (actionCount >= options.maxSteps) break;

    const { toolCall } = turn;
    let result: StepResult | undefined;
    let error: string | undefined;
    let resultText: string;
    const safetyCountBefore = options.getSafetyBlockCount?.() ?? 0;

    const actionNumber = String(actionCount + 1).padStart(String(options.maxSteps).length, ' ');
    options.logger?.verbose(
      `Action ${actionNumber}/${options.maxSteps}: ${actionDescription(toolCall.name, toolCall.input)}`,
    );
    options.logger?.debug('agent.tool_call_requested', 'Agent requested a tool call', {
      flowIndex,
      stepIndex: actionCount,
      tool: toolCall.name,
      input: toolCall.input,
    });

    const plannedCost = actionBudgetCost(toolCall);
    let consumedCost = 1;
    const networkBeforeStep = options.recorder?.network.length ?? 0;
    try {
      if (toolCall.name === 'burst' && plannedCost > options.maxSteps - actionCount) {
        throw new Error(
          `burst: count ${plannedCost} exceeds the remaining action budget of ${options.maxSteps - actionCount}.`,
        );
      }
      // Reserve the full requested count. A burst may stop part-way through after an individual
      // repetition fails, so charging the requested count is the conservative budget contract.
      consumedCost = plannedCost;
      const toolResult = await executeToolCall(
        page,
        toolCall,
        tabRegistryHandle.tabs,
        options.safety,
        options.browserRestartHooks,
        options.browserLifecycle,
      );
      // Deliberately excludes `activePage` (openTab/openInNewTab/switchTab/reopenBrowser only) —
      // a raw Playwright Page has circular internal references, and both this step's history
      // entry and the persisted evidence log run through Redactor.redact(), which has no cycle
      // guard and recurses into whatever it's given until the stack overflows. `activePage` is
      // consumed once, right below, purely to retarget `page` — it must never ride along into
      // `result`, which becomes part of this step's permanent, serialized record.
      const { activePage, ...toolResultWithoutPage } = toolResult;
      result = {
        ...toolResultWithoutPage,
        url: redactor.url(toolResult.url),
        snapshot: redactor.text(toolResult.snapshot),
        ...(toolResult.expectation
          ? { expectation: redactor.redact(toolResult.expectation) as StepResult['expectation'] }
          : {}),
      };
      resultText = `URL: ${result.url}\n${clipForCheckpoint(result.snapshot, MODEL_SNAPSHOT_MAX_CHARS)}`;
      if (result.expectation) {
        resultText += `\nExpectation ${result.expectation.expectationIndex}: ${result.expectation.status} — ${result.expectation.detail}`;
      }
      if (activePage) {
        page = activePage;
        await options.onActivePageChange?.(page);
      }
      options.logger?.debug('agent.tool_call_completed', 'Browser action completed', {
        flowIndex,
        stepIndex: actionCount,
        tool: toolCall.name,
        url: result.url,
      });
    } catch (err) {
      error = (err as Error).message;
      resultText = `Error: ${error}`;
      options.logger?.actionFailure(
        `Action ${actionNumber}/${options.maxSteps} failed: ${actionLabel(toolCall.name)} — ${actionFailureReason(error)}`,
      );
      options.logger?.debug('agent.tool_call_failed', 'Browser action failed', {
        flowIndex,
        stepIndex: actionCount,
        tool: toolCall.name,
        error,
      });
    }

    if (toolCall.name === 'burst') {
      flowBurstNetwork = flowBurstNetwork.concat(options.recorder?.network.slice(networkBeforeStep) ?? []);
    }

    const safetyBlocked = Math.max(0, (options.getSafetyBlockCount?.() ?? safetyCountBefore) - safetyCountBefore);
    if (safetyBlocked > 0) {
      resultText += `\nSafety policy blocked ${safetyBlocked} network request${safetyBlocked === 1 ? '' : 's'} during this action. The request was not sent; do not repeat the same action. Choose a different safe path or leave the flow incomplete.`;
      options.logger?.verbose(
        `Action ${actionNumber}/${options.maxSteps} limited by safety policy: ${safetyBlocked} request${safetyBlocked === 1 ? '' : 's'} blocked`,
      );
      options.logger?.debug('safety.action_blocked', 'The action triggered one or more safety blocks', {
        flowIndex,
        stepIndex: actionCount,
        tool: toolCall.name,
        blockedRequests: safetyBlocked,
      });
    }

    const step: LoopStep = {
      toolCall: { name: toolCall.name, input: toolCall.input },
      result,
      error,
      safetyBlocked: safetyBlocked || undefined,
    };
    history.push(step);
    if (result?.expectation) {
      expectationObservations.push({ ...result.expectation, flowIndex, historyIndex: history.length - 1 });
    }
    options.onStep?.(step, history.length - 1, flowIndex);

    actionCount += consumedCost;
    const screenshot = options.captureScreenshots ? await captureScreenshot(page, { maskInputs: true }) : undefined;
    if (actionCount >= options.maxSteps) {
      options.logger?.debug(
        'agent.finalization_requested',
        'Requesting a flow classification after the final allowed browser action',
        {
          flowIndex,
          actionCount,
          maxSteps: options.maxSteps,
        },
      );
      try {
        turn = await provider.continue(
          {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            result: resultText,
            screenshot,
          },
          { signal: options.signal },
        );
      } catch (err) {
        if (options.signal?.aborted) throw err;
        options.logger?.debug('agent.finalization_failed', 'Could not classify the final browser state', {
          error: (err as Error).message,
        });
        break;
      }
      continue;
    }

    const checkpointEvery = options.contextCheckpointActions ?? DEFAULT_CONTEXT_CHECKPOINT_ACTIONS;
    if (checkpointEvery > 0 && actionCount % checkpointEvery === 0) {
      const currentSnapshot = result ?? (await toStepResult(page, redactor));
      turn = await provider.start({
        systemPrompt: systemPrompt(),
        tools: TOOL_DEFINITIONS,
        initialInput: checkpointInput(history, flowStartIndex, currentSnapshot, flows, options.maxSteps - actionCount),
        screenshot,
        signal: options.signal,
      });
      options.logger?.debug('agent.context_checkpoint', 'Agent context checkpoint created', {
        actionCount,
        remainingSteps: options.maxSteps - actionCount,
      });
    } else {
      turn = await provider.continue(
        {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: resultText,
          screenshot,
        },
        { signal: options.signal },
      );
    }
  }

  if (actionCount > flowActionStartCount) {
    const actionsInActiveFlow = actionCount - flowActionStartCount;
    options.logger?.verbose(
      `Flow ${flowIndex + 1} incomplete: ${actionsInActiveFlow} action(s) executed before the exploration budget was reached`,
    );
    options.logger?.debug('flow.incomplete', 'Active flow did not reach a completion signal before budget exhaustion', {
      flowIndex,
      actions: actionsInActiveFlow,
      maxSteps: options.maxSteps,
    });
  }

  return {
    history,
    flows,
    exhausted: true,
    stopReason: 'budget_exhausted',
    expectationResults: aggregateExpectationResults(options.expectations ?? [], expectationObservations),
    finalPage: page,
  };
}
