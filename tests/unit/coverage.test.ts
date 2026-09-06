import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoverage } from '../../src/report/coverage.js';
import type { EvidenceEntry } from '../../src/evidence/log.js';

function entry(network: EvidenceEntry['network']): EvidenceEntry {
  return { index: 0, flowIndex: 0, timestamp: '2026-01-01T00:00:00.000Z', network, console: [] };
}

test('aggregates visits by method+path, tracks personas and error statuses', () => {
  const coverage = buildCoverage([
    {
      persona: 'noah',
      entries: [
        entry([{ method: 'GET', url: 'https://example.test/catalog', status: 200 }]),
        entry([{ method: 'GET', url: 'https://example.test/catalog', status: 200 }]),
        entry([{ method: 'GET', url: 'https://example.test/checkout', status: 503 }]),
      ],
    },
    {
      persona: 'owen',
      entries: [entry([{ method: 'GET', url: 'https://example.test/catalog', status: 200 }])],
    },
  ]);

  assert.equal(coverage.totalVisits, 4);
  assert.equal(coverage.totalEndpoints, 2);
  assert.equal(coverage.totalErrorVisits, 1);

  const catalogEndpoint = coverage.groups
    .flatMap((group) => group.endpoints)
    .find((endpoint) => endpoint.path === '/catalog');
  assert.ok(catalogEndpoint);
  assert.equal(catalogEndpoint!.visits, 3);
  assert.deepEqual(catalogEndpoint!.personas, ['noah', 'owen']);
  assert.equal(catalogEndpoint!.errorVisits, 0);

  const checkoutEndpoint = coverage.groups
    .flatMap((group) => group.endpoints)
    .find((endpoint) => endpoint.path === '/checkout');
  assert.equal(checkoutEndpoint!.errorVisits, 1);
  assert.deepEqual(checkoutEndpoint!.statuses, [503]);
});

test('groups endpoints by their first path segment', () => {
  const coverage = buildCoverage([
    {
      persona: 'noah',
      entries: [
        entry([{ method: 'GET', url: 'https://example.test/products/desk-lamp', status: 200 }]),
        entry([{ method: 'GET', url: 'https://example.test/products/mug', status: 200 }]),
        entry([{ method: 'GET', url: 'https://example.test/', status: 200 }]),
      ],
    },
  ]);

  const productsGroup = coverage.groups.find((group) => group.prefix === 'products');
  assert.ok(productsGroup);
  assert.equal(productsGroup!.endpoints.length, 2);
  assert.equal(productsGroup!.visits, 2);

  const rootGroup = coverage.groups.find((group) => group.prefix === '(root)');
  assert.ok(rootGroup);
  assert.equal(rootGroup!.visits, 1);
});

test('excludes same-origin infrastructure beacons from coverage', () => {
  const coverage = buildCoverage([
    {
      persona: 'noah',
      entries: [entry([{ method: 'POST', url: 'https://example.test/cdn-cgi/rum', status: 204 }])],
    },
  ]);
  assert.equal(coverage.totalVisits, 0);
  assert.equal(coverage.totalEndpoints, 0);
});
