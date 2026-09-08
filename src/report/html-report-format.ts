export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanDiagnostic(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- deliberately matches ESC to strip ANSI escape sequences
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\ufffd\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex -- deliberately strips other non-printable control characters
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n?/g, '\n')
      .trim()
  );
}

/** A Playwright error carries the human-readable reason on its first line, then a "Call log:"
 * trace (locator resolution, retry attempts, the full outerHTML of the element) meant for a
 * terminal or evidence.jsonl, not this report. Keep only the sentence a reader can act on. */
export function summarizeReason(value: string): string {
  const cleaned = cleanDiagnostic(value);
  const [firstLine] = cleaned.split(/\n\s*Call log:/i);
  return (firstLine ?? cleaned).trim();
}

export function actionLabel(name: string): string {
  const labels: Record<string, string> = {
    navigate: 'Navigate',
    click: 'Click',
    doubleClick: 'Double click',
    fill: 'Fill',
    select: 'Select',
    pressKey: 'Press key',
    check: 'Check',
    uncheck: 'Uncheck',
    hover: 'Hover',
    dragAndDrop: 'Drag and drop',
    goBack: 'Go back',
    goForward: 'Go forward',
    reload: 'Reload',
    openInNewTab: 'Open new tab',
    reopenBrowser: 'Reopen browser',
    scroll: 'Scroll',
    setViewportSize: 'Set viewport',
    waitFor: 'Wait for element',
    uploadFile: 'Upload file',
    download: 'Download',
    handleDialog: 'Handle dialog',
    verifyExpectation: 'Verify expectation',
    clearCookie: 'Clear cookie',
    simulateFailure: 'Simulate failure',
    simulateLatency: 'Simulate latency',
    burst: 'Repeat action',
  };
  return labels[name] ?? name;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escapeHtml(iso);
  return escapeHtml(
    date
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, 'Z'),
  );
}

export function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'unavailable';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** One shared way to place two or more related facts side by side, everywhere in this report. */
export function metaRow(items: string[]): string {
  return `<div class="meta-row">${items.map((item) => `<span>${item}</span>`).join('')}</div>`;
}
