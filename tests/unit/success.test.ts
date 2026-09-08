import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeSuccessByUrl, looksLikeSuccessBySnapshot } from '../../src/agent/success.js';

test('looksLikeSuccessByUrl recognizes non-commerce result/settings URLs', () => {
  assert.ok(looksLikeSuccessByUrl('https://example.test/search/results/?q=Prague'));
  assert.ok(looksLikeSuccessByUrl('https://example.test/settings?saved=true'));
  assert.ok(looksLikeSuccessByUrl('https://example.test/profile?updated=1'));
  assert.ok(looksLikeSuccessByUrl('https://example.test/favorites/added'));
  assert.ok(!looksLikeSuccessByUrl('https://example.test/search/'));
});

test('looksLikeSuccessByUrl does not match a word inside its own opposite', () => {
  assert.ok(!looksLikeSuccessByUrl('https://example.test/settings?unsaved=true'));
  assert.ok(!looksLikeSuccessByUrl('https://example.test/items/padded-box'));
});

test('looksLikeSuccessBySnapshot recognizes a settings-saved confirmation', () => {
  assert.ok(looksLikeSuccessBySnapshot('- alert: Your changes have been saved'));
  assert.ok(looksLikeSuccessBySnapshot('- text: Settings saved'));
  assert.ok(looksLikeSuccessBySnapshot('- heading "12 results found"'));
  assert.ok(looksLikeSuccessBySnapshot('- text: Signed in successfully'));
  assert.ok(looksLikeSuccessBySnapshot('- heading "Welcome back, Jan"'));
});

test('looksLikeSuccessBySnapshot recognizes list/upload/share/notification confirmations', () => {
  assert.ok(looksLikeSuccessBySnapshot('- alert: Added to your wishlist'));
  assert.ok(looksLikeSuccessBySnapshot('- text: Item added to favorites'));
  assert.ok(looksLikeSuccessBySnapshot('- alert: Upload complete'));
  assert.ok(looksLikeSuccessBySnapshot('- text: Copied to clipboard'));
  assert.ok(looksLikeSuccessBySnapshot('- alert: Invitation sent'));
  assert.ok(looksLikeSuccessBySnapshot('- text: Successfully subscribed'));
});

test('looksLikeSuccessBySnapshot does not match "changes" and "saved" out of order', () => {
  assert.ok(!looksLikeSuccessBySnapshot('- alert: You have unsaved changes'));
});

test('looksLikeSuccessBySnapshot does not treat an empty result state as success', () => {
  assert.ok(!looksLikeSuccessBySnapshot('- text: No results found for your search'));
});
