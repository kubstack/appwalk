import type { ReportFlow, ReportRun } from './contract.js';
import { escapeHtml, metaRow } from './html-report-format.js';
import { renderFlow } from './html-report-flow-view.js';

export function renderBrief(run: ReportRun): string {
  const scope = run.scope ? `<div class="scope"><span class="eyebrow">Scope</span>${escapeHtml(run.scope)}</div>` : '';
  const expectations =
    run.expectations.length > 0
      ? `<div class="expect"><span class="eyebrow">Expectations</span><ol>${run.expectations.map((expectation) => `<li>${escapeHtml(expectation)}</li>`).join('')}</ol></div>`
      : '';
  return `<div class="brief">
    <h2>${escapeHtml(run.persona ?? run.name)}${run.personaIntent ? `<span class="intent ${run.personaIntent}">${run.personaIntent}</span>` : ''}</h2>
    ${scope}${expectations}
  </div>`;
}

export function renderCase(run: ReportRun, index: number, active: boolean): string {
  // Counts only baseline flows — derived response scenarios are nested under their baseline in
  // the detail view, so they shouldn't inflate the top-level "N flows" count here either.
  const baselineFlows = run.flows.filter((flow) => flow.origin !== 'derived');
  const confirmed = baselineFlows.filter((flow) => flow.replayConfirmed).length;
  const metaItems = [`${baselineFlows.length} flow${baselineFlows.length === 1 ? '' : 's'}`, `${confirmed} confirmed`];
  if (run.error) metaItems.push(`<span class="text-critical">failed</span>`);
  return `<button class="case" aria-current="${active}" data-case="run-${index}">
    <div class="case-top"><span class="case-name">${escapeHtml(run.persona ?? run.name)}</span>${run.personaIntent ? `<span class="intent ${run.personaIntent}">${run.personaIntent}</span>` : ''}</div>
    ${metaRow(metaItems).replace('class="meta-row"', 'class="meta-row case-meta"')}
  </button>`;
}

export function renderRunDetail(run: ReportRun, index: number, active: boolean): string {
  const errorNote = run.error
    ? `<div class="note critical"><span class="eyebrow">Run error</span><span>${escapeHtml(run.error)}</span></div>`
    : '';
  // Derived flows are confirmed response scenarios of a baseline flow, not independent flows —
  // nest them under that baseline instead of listing them as flat, unrelated top-level cards.
  const baselineFlows = run.flows.filter((flow) => flow.origin !== 'derived');
  const derivedByParent = new Map<string, ReportFlow[]>();
  for (const flow of run.flows) {
    if (flow.origin !== 'derived' || !flow.parentFlowId) continue;
    const siblings = derivedByParent.get(flow.parentFlowId) ?? [];
    siblings.push(flow);
    derivedByParent.set(flow.parentFlowId, siblings);
  }
  const flows =
    baselineFlows.length > 0
      ? baselineFlows
          .map((flow) => {
            const audit = run.responseVariants.find((candidate) =>
              flow.id.endsWith(`-flow-${candidate.flowIndex + 1}`),
            );
            return renderFlow(flow, derivedByParent.get(flow.id) ?? [], audit);
          })
          .join('')
      : `<p class="empty">No flows discovered in this run.</p>`;
  return `<section class="persona-detail" id="run-${index}"${active ? '' : ' hidden'}>
    ${renderBrief(run)}
    ${errorNote}
    ${flows}
  </section>`;
}
