import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanMacroTargets, parseMacroTargets } from '../src/macroTargets.ts';
import { toPublicUser } from '../src/stores.ts';
import { ValidationError } from '../src/validate.ts';

test('targets are checked, put in nutrient order and rounded', () => {
  assert.deepEqual(
    parseMacroTargets([
      { nutrient: 'protein', direction: 'atLeast', amount: 100.04 },
      { nutrient: 'calories', direction: 'atMost', amount: 2500 },
    ]),
    [
      { nutrient: 'calories', direction: 'atMost', amount: 2500 },
      { nutrient: 'protein', direction: 'atLeast', amount: 100 },
    ],
  );
  assert.deepEqual(parseMacroTargets([]), []);
});

test('bad targets are refused', () => {
  const bad: unknown[] = [
    'nope',
    [{ nutrient: 'vitamin c', direction: 'atLeast', amount: 1 }],
    [{ nutrient: 'protein', direction: 'about', amount: 1 }],
    [{ nutrient: 'protein', direction: 'atLeast', amount: 0 }],
    [{ nutrient: 'protein', direction: 'atLeast', amount: -5 }],
    [{ nutrient: 'protein', direction: 'atLeast', amount: '100' }],
    [{ nutrient: 'protein', direction: 'atLeast', amount: 1e9 }],
    [null],
    [
      { nutrient: 'protein', direction: 'atLeast', amount: 100 },
      { nutrient: 'protein', direction: 'atMost', amount: 200 },
    ],
  ];
  for (const input of bad) assert.throws(() => parseMacroTargets(input), ValidationError, JSON.stringify(input));
});

test('stored targets that no longer make sense are dropped, not sent to the browser', () => {
  const good = { nutrient: 'fiber', direction: 'atLeast', amount: 30 } as const;
  assert.deepEqual(cleanMacroTargets([good, { nutrient: 'iron', direction: 'atLeast', amount: 8 }]), [good]);
  assert.deepEqual(cleanMacroTargets(undefined), []);
  const user = { id: 'u1', username: 'a', passwordHash: 'h', createdAt: '' };
  assert.deepEqual(toPublicUser(user).macroTargets, []);
  assert.deepEqual(toPublicUser({ ...user, macroTargets: [good] }).macroTargets, [good]);
});
