import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SCALE, compareToTargets, macroBar } from './macros.ts';
import type { MacroNutrient, MacroTarget, Portion } from './macros.ts';

const nutrients = (n: Partial<Record<MacroNutrient, number>>): Record<MacroNutrient, number> => ({
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  ...n,
});

const protein100: MacroTarget = { nutrient: 'protein', direction: 'atLeast', amount: 100 };
const calories2500: MacroTarget = { nutrient: 'calories', direction: 'atMost', amount: 2500 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('one serving against an "at least" and an "at most" target', () => {
  const serving: Portion = { label: 'Chili', perServing: nutrients({ protein: 32, calories: 650 }) };
  const [cal, pro] = compareToTargets([serving], [calories2500, protein100]);
  assert.equal(pro.status, 'short');
  assert.equal(pro.amount, 32);
  close(pro.ratio, 0.32);
  assert.equal(pro.gap, 68);
  assert.equal(cal.status, 'within');
  assert.equal(cal.gap, 1850);
});

test('reaching an "at least" target is met; passing an "at most" target is over', () => {
  const big: Portion = { label: 'Feast', perServing: nutrients({ protein: 100, calories: 3000 }) };
  const [pro, cal] = compareToTargets([big], [protein100, calories2500]);
  assert.equal(pro.status, 'met');
  assert.equal(pro.gap, 0);
  assert.equal(cal.status, 'over');
  assert.equal(cal.gap, 500);
  // Exactly on an "at most" target is still within it.
  assert.equal(compareToTargets([{ label: 'x', perServing: nutrients({ calories: 2500 }) }], [calories2500])[0].status, 'within');
});

test('a day of several recipes adds up, keeping each one\'s share', () => {
  const day: Portion[] = [
    { label: 'Oats', perServing: nutrients({ protein: 12, calories: 400 }) },
    { label: 'Chili', perServing: nutrients({ protein: 32, calories: 650 }), servings: 2 },
    { label: 'Salad', perServing: nutrients({ protein: 8, calories: 300 }) },
  ];
  const [pro] = compareToTargets(day, [protein100]);
  assert.equal(pro.amount, 84);
  assert.deepEqual(
    pro.parts.map((p) => [p.label, p.amount]),
    [
      ['Oats', 12],
      ['Chili', 64],
      ['Salad', 8],
    ],
  );
  const [cal] = compareToTargets(day, [calories2500]);
  assert.equal(cal.amount, 2000);
  assert.equal(cal.status, 'within');
});

test('no food compares as nothing eaten; targets without an amount are left out', () => {
  const [pro] = compareToTargets([], [protein100, { ...calories2500, amount: 0 }]);
  assert.equal(pro.amount, 0);
  assert.equal(pro.status, 'short');
  assert.equal(compareToTargets([], [{ ...calories2500, amount: 0 }]).length, 0);
});

test('a bar under its target fills part of the way, with the mark at the end', () => {
  const [c] = compareToTargets([{ label: 'a', perServing: nutrients({ protein: 25 }) }], [protein100]);
  const bar = macroBar(c);
  assert.equal(bar.targetAt, 100);
  close(bar.fillEnd, 25);
  assert.equal(bar.clipped, false);
});

test('a bar past its target grows, moving the mark left so the overflow shows', () => {
  const [c] = compareToTargets([{ label: 'a', perServing: nutrients({ calories: 3000 }) }], [calories2500]);
  const bar = macroBar(c);
  close(bar.targetAt, 100 / 1.2);
  close(bar.fillEnd, 100);
  // Far past the target, the bar stops growing and says it's clipped.
  const [huge] = compareToTargets([{ label: 'a', perServing: nutrients({ calories: 10000 }) }], [calories2500]);
  const hugeBar = macroBar(huge);
  close(hugeBar.targetAt, 100 / MAX_SCALE);
  close(hugeBar.fillEnd, 100);
  assert.equal(hugeBar.clipped, true);
});

test('each portion gets its own stretch of the bar, never past the end', () => {
  const day: Portion[] = [
    { label: 'Lunch', perServing: nutrients({ calories: 1500 }) },
    { label: 'Dinner', perServing: nutrients({ calories: 2500 }) },
  ];
  const bar = macroBar(compareToTargets(day, [calories2500])[0]);
  // 4000 of 2500 is past MAX_SCALE: the bar is 3750 kcal wide.
  close(bar.parts[0].width, 40);
  close(bar.parts[1].width, 60);
  close(bar.fillEnd, 100);
});
