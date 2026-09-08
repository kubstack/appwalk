import type { Page } from 'playwright';
import type { ExpectationObservation, ExpectationStatus, StepResult } from '../types.js';

export interface LoopStep {
  toolCall?: { name: string; input: Record<string, unknown> };
  result?: StepResult;
  error?: string;
  finalText?: string;
  safetyBlocked?: number;
}

export interface FlowResult {
  /** Indices into the returned `history` array — inclusive range covering just this flow's steps. */
  startIndex: number;
  endIndex: number;
  finalText: string;
  title?: string;
  verified: boolean;
  /** URL captured at the flow's starting point, which may differ from the CLI's root URL. */
  startUrl: string;
  /** JSON-serialized browser storage captured when this flow began, for deterministic replay. */
  startStorageState: string;
}

export type LoopStopReason = 'completed' | 'agent_stopped' | 'budget_exhausted' | 'no_progress';

export interface LoopResult {
  history: LoopStep[];
  /** One entry per flow the agent completed (via `flowComplete`, or by ending its turn in plain text). */
  flows: FlowResult[];
  /** True if the loop stopped because it ran out of step budget. */
  exhausted: boolean;
  stopReason: LoopStopReason;
  expectationResults: ExpectationResult[];
  /** The page actually active when the loop ended — the same page it was called with, unless an action
   * (a new tab, a reopened browser) switched it. The caller must close this page's browser, not
   * necessarily the one it originally passed in. */
  finalPage: Page;
}

export interface ExpectationResult {
  expectationIndex: number;
  text: string;
  status: ExpectationStatus;
  observations: Array<ExpectationObservation & { flowIndex: number; historyIndex: number }>;
}
