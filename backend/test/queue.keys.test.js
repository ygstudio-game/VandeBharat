// Unit test — pure key helpers, NO Redis. Always-green CI gate for the backend.
const { test } = require('node:test');
const assert = require('node:assert');
const { streamKey, dlqKey, groupName } = require('../src/queue/queue');

test('streamKey builds namespaced stream key', () => {
  assert.strictEqual(streamKey('ocr'), 'vande:stream:ocr');
});

test('dlqKey builds dead-letter key', () => {
  assert.strictEqual(dlqKey('ocr'), 'vande:stream:ocr:dlq');
});

test('groupName builds consumer-group name', () => {
  assert.strictEqual(groupName('ocr'), 'vande:group:ocr');
});

test('keys are distinct per stage', () => {
  assert.notStrictEqual(streamKey('ocr'), streamKey('yolo'));
  assert.notStrictEqual(dlqKey('sync'), streamKey('sync'));
});
