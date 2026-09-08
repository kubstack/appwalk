/** Generic, domain-agnostic JSON-shape validation primitives shared by evidence-validation.ts and
 * manifest-validation.ts. */

import { isValidWebUrl } from '../url.js';

export interface ArtifactValidationIssue {
  path: string;
  message: string;
}

export const MAX_ARTIFACT_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_ARTIFACT_LINE_BYTES = 8 * 1024 * 1024;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_ARRAY_ITEMS = 100_000;
const MAX_JSON_STRING_LENGTH = 8_000_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function has(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function issue(issues: ArtifactValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function recordAt(
  value: unknown,
  path: string,
  issues: ArtifactValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issue(issues, path, 'must be an object');
    return undefined;
  }
  return value;
}

export function arrayAt(value: unknown, path: string, issues: ArtifactValidationIssue[]): unknown[] | undefined {
  if (!Array.isArray(value)) {
    issue(issues, path, 'must be an array');
    return undefined;
  }
  if (value.length > MAX_JSON_ARRAY_ITEMS) issue(issues, path, `must contain at most ${MAX_JSON_ARRAY_ITEMS} items`);
  return value;
}

export function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (typeof value[key] !== 'string' || value[key].length === 0)
    issue(issues, `${path}.${key}`, 'must be a non-empty string');
}

export function requiredWebUrl(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (!isValidWebUrl(value[key])) issue(issues, `${path}.${key}`, 'must be a valid absolute http or https URL');
}

export function optionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (has(value, key) && (typeof value[key] !== 'string' || value[key].length === 0))
    issue(issues, `${path}.${key}`, 'must be a non-empty string when present');
}

export function requiredBoolean(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (typeof value[key] !== 'boolean') issue(issues, `${path}.${key}`, 'must be a boolean');
}

export function optionalBoolean(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (has(value, key) && typeof value[key] !== 'boolean')
    issue(issues, `${path}.${key}`, 'must be a boolean when present');
}

export function requiredInteger(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
  minimum = 0,
): void {
  if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < minimum) {
    issue(issues, `${path}.${key}`, `must be a safe integer >= ${minimum}`);
  }
}

export function optionalInteger(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
  minimum = 0,
): void {
  if (
    has(value, key) &&
    (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < minimum)
  ) {
    issue(issues, `${path}.${key}`, `must be a safe integer >= ${minimum} when present`);
  }
}

export function optionalStatus(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  if (
    has(value, key) &&
    (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 100 || value[key] > 599)
  ) {
    issue(issues, `${path}.${key}`, 'must be an HTTP status integer between 100 and 599 when present');
  }
}

export function enumValue(
  value: Record<string, unknown>,
  key: string,
  path: string,
  allowed: Set<string>,
  issues: ArtifactValidationIssue[],
  required = false,
): void {
  if (!has(value, key)) {
    if (required) issue(issues, `${path}.${key}`, `is required and must be one of ${[...allowed].join(', ')}`);
    return;
  }
  if (typeof value[key] !== 'string' || !allowed.has(value[key]))
    issue(issues, `${path}.${key}`, `must be one of ${[...allowed].join(', ')}`);
}

export function knownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: ArtifactValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(issues, `${path}.${key}`, 'unknown field');
  }
}

export function validateJsonValue(value: unknown, path: string, issues: ArtifactValidationIssue[], depth = 0): void {
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING_LENGTH)
      issue(issues, path, `string exceeds ${MAX_JSON_STRING_LENGTH} characters`);
    return;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && !Number.isFinite(value)) issue(issues, path, 'must contain only finite numbers');
    return;
  }
  if (depth >= MAX_JSON_DEPTH) {
    issue(issues, path, `nested value exceeds maximum depth of ${MAX_JSON_DEPTH}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_ITEMS) issue(issues, path, `array exceeds ${MAX_JSON_ARRAY_ITEMS} items`);
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues, depth + 1));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateJsonValue(item, `${path}.${key}`, issues, depth + 1));
    return;
  }
  issue(issues, path, 'contains a non-JSON value');
}

export function validateStringArray(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  const items = arrayAt(value, path, issues);
  items?.forEach((item, index) => {
    if (typeof item !== 'string' || item.length === 0) issue(issues, `${path}[${index}]`, 'must be a non-empty string');
  });
}

export function formatArtifactIssues(issues: ArtifactValidationIssue[], max = 8): string {
  const shown = issues.slice(0, max).map((item) => `${item.path}: ${item.message}`);
  return issues.length > max ? `${shown.join('; ')}; and ${issues.length - max} more issue(s)` : shown.join('; ');
}
