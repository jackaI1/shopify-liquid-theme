import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERY_NOTE_MAX_LENGTH,
  buildCartAttributes,
  buildLinePayload,
  formatCents,
  freeDeliveryProgress,
  sanitizeDeliveryNote,
} from '../assets/cart-drawer.js';

test('formatCents shows dollars and cents for the shop currency', () => {
  assert.equal(formatCents(1250, 'USD'), '$12.50');
  assert.equal(formatCents(0, 'USD'), '$0.00');
  assert.equal(formatCents(4000, 'USD'), '$40.00');
});

test('freeDeliveryProgress reports the amount still missing', () => {
  assert.deepEqual(freeDeliveryProgress(2000, 4000), { reached: false, remainingCents: 2000, percent: 50 });
});

test('freeDeliveryProgress is reached exactly at the threshold and capped above it', () => {
  assert.deepEqual(freeDeliveryProgress(4000, 4000), { reached: true, remainingCents: 0, percent: 100 });
  assert.deepEqual(freeDeliveryProgress(5300, 4000), { reached: true, remainingCents: 0, percent: 100 });
});

test('freeDeliveryProgress treats a zero threshold as already reached and ignores negative subtotals', () => {
  assert.equal(freeDeliveryProgress(0, 0).reached, true);
  assert.deepEqual(freeDeliveryProgress(-500, 4000), { reached: false, remainingCents: 4000, percent: 0 });
});

test('sanitizeDeliveryNote trims and collapses whitespace', () => {
  assert.equal(sanitizeDeliveryNote('  Leave it\n\nby the   gate\t '), 'Leave it by the gate');
});

test('sanitizeDeliveryNote replaces control characters with spaces', () => {
  assert.equal(sanitizeDeliveryNote('ring\u0007bell\u0000twice'), 'ring bell twice');
});

test('sanitizeDeliveryNote caps the length and accepts missing values', () => {
  assert.equal(sanitizeDeliveryNote('x'.repeat(300)).length, DELIVERY_NOTE_MAX_LENGTH);
  assert.equal(sanitizeDeliveryNote(undefined), '');
  assert.equal(sanitizeDeliveryNote(null), '');
});

test('buildCartAttributes always sends both keys so an earlier value can be cleared', () => {
  assert.deepEqual(buildCartAttributes(), { 'Delivery note': '', 'Leave at door': '' });
  assert.deepEqual(
    buildCartAttributes({ note: '  Ring twice ', leaveAtDoor: true }),
    { 'Delivery note': 'Ring twice', 'Leave at door': 'Yes' },
  );
});

test('buildLinePayload builds the /cart/change.js body', () => {
  assert.deepEqual(buildLinePayload(2, 3), { line: 2, quantity: 3 });
});

test('buildLinePayload clamps quantities to 0 through 99 and treats bad numbers as 0', () => {
  assert.deepEqual(buildLinePayload(1, 500), { line: 1, quantity: 99 });
  assert.deepEqual(buildLinePayload(1, -4), { line: 1, quantity: 0 });
  assert.deepEqual(buildLinePayload(1, 'abc'), { line: 1, quantity: 0 });
});

test('buildLinePayload rejects line numbers below 1', () => {
  assert.throws(() => buildLinePayload(0, 1), RangeError);
  assert.throws(() => buildLinePayload(1.5, 1), RangeError);
});
