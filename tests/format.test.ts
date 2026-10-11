import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMinutes, formatTimer } from '../src/ui/format';

test('short focus is shown in seconds instead of zero minutes', () => {
  assert.equal(formatMinutes(25_000), '25 秒');
  assert.equal(formatMinutes(0), '0 分钟');
  assert.equal(formatMinutes(61_000), '1 分钟');
});

test('timer rounds remaining fractional seconds up', () => {
  assert.equal(formatTimer(59_100), '01:00');
  assert.equal(formatTimer(0), '00:00');
});
