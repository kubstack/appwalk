import type { ExecutionReport, ReportRun, ReportSafety } from './contract.js';
import type { ReportCoverageEndpoint, ReportCoverageGroup } from './coverage.js';
import { escapeHtml, metaRow } from './html-report-format.js';

/** Combines every run's own safety tally into one report-level view — a reader comparing
 * personas doesn't care which run hit the block first, only that mutation requests were blocked
 * by default and why coverage looks thinner than the application actually is. */
function aggregateSafety(runs: ReportRun[]): ReportSafety {
  const byMethod: Record<string, number> = {};
  const samples: ReportSafety['samples'] = [];
  const seen = new Set<string>();
  let blockedRequests = 0;
  let explorationBlocked = 0;
  let replayBlocked = 0;
  for (const run of runs) {
    blockedRequests += run.safety.blockedRequests;
    explorationBlocked += run.safety.explorationBlocked;
    replayBlocked += run.safety.replayBlocked;
    for (const [method, count] of Object.entries(run.safety.byMethod)) {
      byMethod[method] = (byMethod[method] ?? 0) + count;
    }
    for (const sample of run.safety.samples) {
      const key = `${sample.phase}:${sample.method}:${sample.url}`;
      if (seen.has(key) || samples.length >= 10) continue;
      seen.add(key);
      samples.push(sample);
    }
  }
  return { blockedRequests, explorationBlocked, replayBlocked, byMethod, samples, safetyRelatedRuntimeErrors: 0 };
}

function renderSafetyNote(safety: ReportSafety): string {
  if (safety.blockedRequests === 0) return '';
  const methodChips = Object.entries(safety.byMethod)
    .map(([method, count]) => `<div class="runtime-issue mono">${escapeHtml(method)} ×${count}</div>`)
    .join('');
  const samples = safety.samples
    .slice(0, 5)
    .map((sample) => `<div class="runtime-issue mono">${escapeHtml(sample.method)} ${escapeHtml(sample.url)}</div>`)
    .join('');
  const warning = `<div class="note warning">
    <span class="eyebrow">Safety policy blocked ${safety.blockedRequests} request${safety.blockedRequests === 1 ? '' : 's'}</span>
    <span>Appwalk blocks POST/PUT/PATCH/DELETE by default, so mutation-heavy paths (checkout, forms, deletes) stay under-covered until you allow them. Pass <span class="mono">--allow-destructive</span> against a disposable environment to cover these too.</span>
  </div>`;
  const detail = `<div class="note muted safety-detail">
    <span class="eyebrow">Blocked by method</span>
    ${methodChips}
    <span class="eyebrow safety-examples-label">Examples</span>
    ${samples}
  </div>`;
  return `${warning}${detail}`;
}

function renderCoverageEndpoint(endpoint: ReportCoverageEndpoint): string {
  const statusText =
    endpoint.errorVisits > 0
      ? `<span class="text-critical">${endpoint.statuses.join(', ')}</span>`
      : endpoint.statuses.length > 0
        ? escapeHtml(endpoint.statuses.join(', '))
        : '—';
  return `<tr>
    <td class="mono">${escapeHtml(endpoint.method)}</td>
    <td class="mono">${escapeHtml(endpoint.path)}</td>
    <td class="mono">${endpoint.visits}</td>
    <td>${escapeHtml(endpoint.personas.join(', '))}</td>
    <td>${statusText}</td>
  </tr>`;
}

function renderCoverageGroup(group: ReportCoverageGroup): string {
  const errorNote =
    group.errorVisits > 0
      ? ` · <span class="text-critical">${group.errorVisits} error response${group.errorVisits === 1 ? '' : 's'}</span>`
      : '';
  return `<div class="cov-group">
    <div class="cov-group-head"><h3>${escapeHtml(group.prefix)}</h3>${metaRow([`${group.visits} request${group.visits === 1 ? '' : 's'}${errorNote}`])}</div>
    <div class="cov-table-wrap"><table class="cov-table">
      <thead><tr><th>Method</th><th>Path</th><th>Visits</th><th>Personas</th><th>Status</th></tr></thead>
      <tbody>${group.endpoints.map(renderCoverageEndpoint).join('')}</tbody>
    </table></div>
  </div>`;
}

export function renderCoverageView(report: ExecutionReport): string {
  const { coverage } = report;
  const safety = aggregateSafety(report.runs);
  const intro = `<p class="coverage-intro">${coverage.totalEndpoints} distinct endpoint${coverage.totalEndpoints === 1 ? '' : 's'} touched across ${coverage.totalVisits} request${coverage.totalVisits === 1 ? '' : 's'}, over ${report.summary.runs} persona run${report.summary.runs === 1 ? '' : 's'}.</p>`;
  const groups =
    coverage.groups.length > 0
      ? coverage.groups.map(renderCoverageGroup).join('')
      : `<p class="empty">No network activity was recorded.</p>`;
  return `<section id="view-coverage">
    ${intro}
    ${renderSafetyNote(safety)}
    <div class="coverage-groups">${groups}</div>
  </section>`;
}
