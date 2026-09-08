import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveryManifest, DiscoveryManifestFlow, DiscoveryManifestRun } from './manifest.js';
import { runOutcome } from './run-summaries.js';
import type { ExplorationBatch } from './orchestrate.js';

function manifestFor(batch: ExplorationBatch): DiscoveryManifest {
  let nextFlowId = 1;
  const flows: DiscoveryManifestFlow[] = [];
  const runs: DiscoveryManifestRun[] = batch.runs.map((run) => {
    const flowIds: number[] = [];
    for (const [runFlowIndex, flow] of (run.discovery?.flows ?? []).entries()) {
      const id = nextFlowId;
      nextFlowId += 1;
      flowIds.push(id);
      const confirmed = run.confirmedFlows.find(
        (candidate) => candidate.origin === 'discovered' && candidate.sourceFlowIndex === runFlowIndex,
      );
      flows.push({
        id,
        runId: run.runId,
        runFlowIndex,
        name: flow.finalText || 'Flow ' + (runFlowIndex + 1),
        title: flow.title,
        verified: flow.verified,
        replayConfirmed: run.replayConfirmedIds.includes(runFlowIndex + 1),
        startIndex: flow.startIndex,
        endIndex: flow.endIndex,
        startUrl: flow.startUrl,
        responseFixtures: confirmed?.responseFixtures,
        origin: 'discovered',
        finding: run.findings.find((finding) => finding.flowIndex === runFlowIndex),
      });
    }
    for (const derived of run.confirmedFlows.filter((flow) => flow.origin === 'derived')) {
      const source = flows.find((flow) => flow.runId === run.runId && flow.runFlowIndex === derived.sourceFlowIndex);
      if (!source) continue;
      const id = nextFlowId;
      nextFlowId += 1;
      flowIds.push(id);
      flows.push({
        id,
        runId: run.runId,
        runFlowIndex: derived.sourceFlowIndex,
        name: derived.name,
        title: derived.title,
        verified: true,
        replayConfirmed: true,
        startIndex: source.startIndex,
        endIndex: source.endIndex,
        startUrl: derived.startUrl ?? source.startUrl,
        responseFixtures: derived.responseFixtures,
        origin: 'derived',
        sourceFlowId: source.id,
        scenarioId: derived.scenarioId,
        responseVariant: derived.responseVariant,
      });
    }
    const outcome = runOutcome(run);
    return {
      id: run.runId,
      name: run.runName,
      persona: run.args.personaName,
      personaIntent: outcome.personaIntent,
      maxSteps: run.args.maxSteps,
      scope: run.args.scope,
      expectations: run.args.expectations,
      exhausted: outcome.exhausted,
      stopReason: outcome.stopReason,
      flowIds,
      error: run.error,
    };
  });

  return {
    version: 2,
    executionId: batch.executionId,
    url: batch.args.url,
    createdAt: new Date().toISOString(),
    exhausted: batch.runs.some((run) => Boolean(run.error) || Boolean(run.discovery?.exhausted)),
    setup: {
      requiresLogin: Boolean(batch.args.email || batch.args.password),
      storageStatePath: batch.args.storageStatePath,
    },
    intent: {
      scope: batch.args.scope,
      expectations: batch.args.expectations,
    },
    runs,
    flows,
  };
}

export function writeDiscoveryArtifacts(batch: ExplorationBatch): string {
  const manifestPath = join(batch.args.output, 'discovery.json');
  const manifest = batch.redactor.redact(manifestFor(batch), { preservePathFields: true }) as DiscoveryManifest;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifestPath;
}
