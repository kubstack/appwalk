import type {
  ExecutionReport,
  ReportFlow,
  ReportResponseVariantAudit,
  ReportRuntimeError,
  ReportStep,
} from './contract.js';
import { escapeHtml, summarizeReason, actionLabel, metaRow } from './html-report-format.js';

/** One consistent label for "we don't yet know if this works" — whether the cause is an
 * inconclusive challenge finding, a replay that couldn't reproduce the flow, or a flow the agent
 * itself never considered verified. The specific reason still shows in the note underneath;
 * this chip only answers the one question a reader scans the board for. */
export function flowStatusChip(flow: ReportFlow): { tone: string; label: string } {
  if (flow.finding?.status === 'confirmed') return { tone: 'critical', label: 'finding confirmed' };
  if (flow.replayConfirmed) return { tone: 'success', label: 'replay confirmed' };
  return { tone: 'warning', label: 'needs review' };
}

/** `flow.id` for a discovered flow is always `<runId>-flow-<n>`; pull the ordinal back out to
 * label a similar-shaped flow ("similar to Flow N") without threading a lookup table around. */
export function flowOrdinal(flowId: string): string | undefined {
  return flowId.match(/-flow-(\d+)$/)?.[1];
}

export function renderStep(step: ReportStep): string {
  const parts = [`<span class="verb">${escapeHtml(actionLabel(step.action))}</span>`];
  if (step.target) parts.push(`<span class="target mono">${escapeHtml(step.target)}</span>`);
  if (step.value !== undefined) parts.push(`<span class="target mono">= ${escapeHtml(step.value)}</span>`);
  const errorNote = step.error
    ? `<div class="step-error">${escapeHtml(step.errorLabel ?? 'Action failed')}: ${escapeHtml(summarizeReason(step.error))}</div>`
    : '';
  const safetyNote = step.safetyBlocked
    ? `<div class="step-note">Safety policy blocked ${step.safetyBlocked} request${step.safetyBlocked === 1 ? '' : 's'}</div>`
    : '';
  return `<li class="step"><span class="idx mono">${step.number}</span><span>${parts.join(' ')}${errorNote}${safetyNote}</span></li>`;
}

const RUNTIME_KIND_LABEL: Record<ReportRuntimeError['kind'], string> = {
  console_error: 'Console error',
  page_error: 'Page error',
  request_failed: 'Request failed',
  http_error: 'HTTP error',
  page_crash: 'Page crash',
};

/** Renders the actual error content (message, and method/url/status when it's a request), not
 * just the category label — a bare "console error ×2" with no message is not diagnosable. */
export function renderRuntimeIssue(issue: ReportRuntimeError): string {
  const label = RUNTIME_KIND_LABEL[issue.kind] ?? issue.kind.replace(/_/g, ' ');
  const count = issue.occurrences > 1 ? ` ×${issue.occurrences}` : '';
  const request =
    issue.method || issue.url
      ? `<span class="mono">${escapeHtml([issue.method, issue.status !== undefined ? String(issue.status) : undefined, issue.url].filter(Boolean).join(' '))}</span> `
      : '';
  // For http_error, `message` is always the fixed template "HTTP <status> response" — the status
  // is already in the request span above, so repeating it here would just say the same thing twice.
  const message = issue.kind === 'http_error' ? '' : escapeHtml(summarizeReason(issue.message));
  return `<div class="runtime-issue"><strong>${escapeHtml(label)}${count}</strong> ${request}${message}</div>`;
}

const VARIANT_STATUS_LABEL: Record<ReportResponseVariantAudit['planningStatus'], string> = {
  not_enabled: 'response variants disabled',
  not_run: 'no baseline response captured to plan from',
  completed: 'planning completed',
  incomplete: 'planning stopped early',
  failed: 'planning failed',
};

/** Response-scenario planning is a whole extra pipeline (capture a real JSON response, propose a
 * patch, replay it, confirm it changed the UI) — worth surfacing even when it produced nothing,
 * since "0 confirmed, 3 rejected" explains why a flow has no variants instead of leaving it silent. */
export function renderVariantAudit(audit: ReportResponseVariantAudit): string {
  if (!audit.enabled) return '';
  const statusLabel = VARIANT_STATUS_LABEL[audit.planningStatus];
  const counts = metaRow([
    `${audit.fixturesFound} fixture${audit.fixturesFound === 1 ? '' : 's'} captured`,
    `${audit.proposed} proposed`,
    `${audit.confirmed} confirmed`,
    `${audit.plannerRejected} rejected`,
  ]);
  const rejectionReasons =
    audit.plannerRejectionReasons.length > 0
      ? `<div class="runtime-issue">Rejected: ${audit.plannerRejectionReasons.map((reason) => escapeHtml(reason)).join('; ')}</div>`
      : '';
  const skipped =
    audit.skipped.length > 0
      ? audit.skipped
          .map(
            (entry) =>
              `<div class="runtime-issue"><strong>${escapeHtml(entry.name)}</strong> skipped — ${escapeHtml(summarizeReason(entry.reason))}</div>`,
          )
          .join('')
      : '';
  const plannerNote = audit.plannerReason ? `<div class="runtime-issue">${escapeHtml(audit.plannerReason)}</div>` : '';
  const tone = audit.planningStatus === 'failed' ? 'warning' : 'muted';
  return `<div class="note ${tone}"><span class="eyebrow">Response scenarios · ${escapeHtml(statusLabel)}</span>${counts}${rejectionReasons}${skipped}${plannerNote}</div>`;
}

export function renderFlow(flow: ReportFlow, children: ReportFlow[] = [], audit?: ReportResponseVariantAudit): string {
  const chip = flowStatusChip(flow);
  const originTag = flow.origin === 'derived' ? `<span class="chip muted">derived scenario</span>` : '';
  const similarOrdinal = flow.similarTo ? flowOrdinal(flow.similarTo) : undefined;
  const similarTag = similarOrdinal ? `<span class="chip muted">similar to Flow ${similarOrdinal}</span>` : '';
  const summary =
    flow.summary && flow.summary !== 'No flow summary provided.'
      ? `<p class="flow-summary">${escapeHtml(flow.summary)}</p>`
      : '';
  const steps =
    flow.steps.length > 0
      ? `<ol class="steps">${flow.steps.map(renderStep).join('')}</ol>`
      : `<p class="empty">No recorded steps.</p>`;
  const failure = flow.replayFailure
    ? `<div class="note warning"><span class="eyebrow">Replay</span><span>${escapeHtml(summarizeReason(flow.replayFailure.reason))}</span></div>`
    : '';
  const finding = flow.finding?.failure
    ? `<div class="note critical"><span class="eyebrow">Finding</span><span>${escapeHtml(summarizeReason(flow.finding.failure))}</span></div>`
    : '';
  const runtimeNotes =
    flow.runtimeIssues.length > 0
      ? `<div class="note warning"><span class="eyebrow">Runtime</span>${flow.runtimeIssues.map(renderRuntimeIssue).join('')}</div>`
      : '';
  const variantAudit = audit ? renderVariantAudit(audit) : '';
  const variants =
    children.length > 0
      ? `<div class="variants"><span class="eyebrow">Response scenarios confirmed (${children.length})</span>${children.map((child) => renderFlow(child)).join('')}</div>`
      : '';
  return `<div class="flow">
    <div class="flow-head"><h3>${escapeHtml(flow.title)}</h3><span class="chip-group">${originTag}${similarTag}<span class="chip ${chip.tone}">${escapeHtml(chip.label)}</span></span></div>
    ${summary}
    ${steps}
    ${failure}${finding}${runtimeNotes}${variantAudit}${variants}
  </div>`;
}

export function outcomeStamp(report: ExecutionReport): { tone: string; label: string } {
  const { summary } = report;
  if (summary.errors > 0) return { tone: 'critical', label: 'failed — an execution error stopped one or more runs' };
  if (summary.confirmedFindings > 0)
    return {
      tone: 'warning',
      label: `${summary.confirmedFindings} finding${summary.confirmedFindings === 1 ? '' : 's'} confirmed`,
    };
  if (summary.inconclusiveFindings > 0 || summary.coverageIncomplete || summary.replayConfirmed === 0) {
    return { tone: 'warning', label: 'inconclusive — coverage incomplete or nothing replay-confirmed' };
  }
  return { tone: 'success', label: 'passed — every confirmed flow verified cleanly' };
}
