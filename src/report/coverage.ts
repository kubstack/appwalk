import type { EvidenceEntry } from '../evidence/log.js';
import { isInfrastructureUrl } from '../url.js';

export interface ReportCoverageEndpoint {
  method: string;
  path: string;
  visits: number;
  personas: string[];
  errorVisits: number;
  statuses: number[];
}

export interface ReportCoverageGroup {
  prefix: string;
  visits: number;
  errorVisits: number;
  endpoints: ReportCoverageEndpoint[];
}

export interface ReportCoverage {
  groups: ReportCoverageGroup[];
  totalEndpoints: number;
  totalVisits: number;
  totalErrorVisits: number;
}

function pathOf(url: string): string | undefined {
  if (isInfrastructureUrl(url)) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return undefined;
  }
}

/** Groups by the first path segment ("/checkout/step-2" -> "checkout") — mechanical, not
 * inferred, so it works the same for any application's own URL structure. */
function groupOf(path: string): string {
  return path.split('/').filter(Boolean)[0] ?? '(root)';
}

interface Hit {
  method: string;
  path: string;
  persona: string;
  status?: number;
}

/** Aggregates real network traffic recorded during exploration into "what did we actually touch"
 * — every distinct method+path, how many times, by which personas, and where an error status
 * showed up. Grouped by URL prefix so a reader can scan by area of the application rather than by
 * raw endpoint list. Derived entirely from evidence already captured for other purposes; no
 * additional crawling or browsing happens to build this. */
export function buildCoverage(runs: Array<{ persona: string; entries: EvidenceEntry[] }>): ReportCoverage {
  const hits: Hit[] = [];
  for (const run of runs) {
    for (const entry of run.entries) {
      for (const net of entry.network) {
        const path = pathOf(net.url);
        if (!path) continue;
        hits.push({ method: net.method.toUpperCase(), path, persona: run.persona, status: net.status });
      }
    }
  }

  const endpoints = new Map<string, ReportCoverageEndpoint>();
  for (const hit of hits) {
    const key = `${hit.method} ${hit.path}`;
    let endpoint = endpoints.get(key);
    if (!endpoint) {
      endpoint = { method: hit.method, path: hit.path, visits: 0, personas: [], errorVisits: 0, statuses: [] };
      endpoints.set(key, endpoint);
    }
    endpoint.visits += 1;
    if (!endpoint.personas.includes(hit.persona)) endpoint.personas.push(hit.persona);
    if (hit.status !== undefined) {
      if (hit.status >= 400) endpoint.errorVisits += 1;
      if (!endpoint.statuses.includes(hit.status)) endpoint.statuses.push(hit.status);
    }
  }
  for (const endpoint of endpoints.values()) {
    endpoint.personas.sort();
    endpoint.statuses.sort((a, b) => a - b);
  }

  const groups = new Map<string, ReportCoverageGroup>();
  for (const endpoint of endpoints.values()) {
    const prefix = groupOf(endpoint.path);
    let group = groups.get(prefix);
    if (!group) {
      group = { prefix, visits: 0, errorVisits: 0, endpoints: [] };
      groups.set(prefix, group);
    }
    group.visits += endpoint.visits;
    group.errorVisits += endpoint.errorVisits;
    group.endpoints.push(endpoint);
  }

  const groupList = [...groups.values()]
    .map((group) => ({ ...group, endpoints: group.endpoints.sort((a, b) => b.visits - a.visits) }))
    .sort((a, b) => b.visits - a.visits);

  return {
    groups: groupList,
    totalEndpoints: endpoints.size,
    totalVisits: hits.length,
    totalErrorVisits: [...endpoints.values()].reduce((total, endpoint) => total + endpoint.errorVisits, 0),
  };
}
