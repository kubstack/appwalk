import type { ExpectationAssertion } from '../types.js';

export interface ResponseFixture {
  method: string;
  url: string;
  /** Position among captured responses with the same method and URL. */
  occurrence?: number;
  /** Glob used for replay when the captured URL contains a resource identifier. */
  urlPattern?: string;
  status: number;
  body: unknown;
}

export interface ResponsePatch {
  path: string;
  value: unknown;
}

export interface ResponseVariant {
  name: string;
  sourceMethod?: string;
  sourceUrl: string;
  sourceOccurrence?: number;
  patches: ResponsePatch[];
  expectation: ResponseExpectation;
  reason?: string;
}

export interface ResponseExpectation {
  assertion: Exclude<ExpectationAssertion, 'unknown'>;
  locator?: string;
  value?: string;
}

export interface ResponseFixtureSelector {
  method?: string;
  url: string;
  occurrence?: number;
}

export interface ResponseFixtureInstallOptions {
  /** Called after a captured fixture has been selected and its response is about to be fulfilled. */
  onFixtureApplied?: (fixture: ResponseFixture, requestUrl: string) => void;
}

export interface ResponseVariantParseResult {
  variants: ResponseVariant[];
  candidates: number;
  rejected: number;
  rejectionReasons: string[];
  reason?: string;
  plannerReason?: string;
  incomplete?: boolean;
}

export const RESPONSE_VARIANT_MAX_OUTPUT_TOKENS = 4096;

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
