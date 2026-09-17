'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AndroidApk = require('../lib/AndroidApk');
const { densityQualifier, densityValue, selectDensitySplits } = AndroidApk._density;

function split(name) {
  return { name, data: Buffer.alloc(0) };
}

const COMPLETE = [
  split('split_config.mdpi.apk'),
  split('split_config.hdpi.apk'),
  split('split_config.xhdpi.apk'),
  split('split_config.xxhdpi.apk'),
  split('split_config.xxxhdpi.apk')
];

test('density names and numeric dpi values are normalized', () => {
  assert.equal(densityQualifier('split_config.xxhdpi.apk'), 'xxhdpi');
  assert.equal(densityQualifier('base-config.420dpi.apk'), '420dpi');
  assert.equal(densityValue('xxhdpi'), 480);
  assert.equal(densityValue('420'), 420);
  assert.equal(densityValue('420dpi'), 420);
});

test('a 420 dpi installation selects xxhdpi regardless of input order', () => {
  const forward = selectDensitySplits(COMPLETE, { densityDpi: 420 });
  const reverse = selectDensitySplits([...COMPLETE].reverse(), { densityDpi: 420 });
  assert.equal(forward[0].name, 'split_config.xxhdpi.apk');
  assert.equal(reverse[0].name, 'split_config.xxhdpi.apk');
});

test('the Play profile density uses a deterministic higher-density midpoint tie', () => {
  const selected = selectDensitySplits(COMPLETE, { densityDpi: 560 });
  assert.equal(selected[0].name, 'split_config.xxxhdpi.apk');
});

test('a named bucket and an exact preferred split are supported', () => {
  assert.equal(
    selectDensitySplits(COMPLETE, { density: 'xxhdpi' })[0].name,
    'split_config.xxhdpi.apk'
  );
  assert.equal(
    selectDensitySplits(COMPLETE, { preferredSplit: 'split_config.hdpi.apk' })[0].name,
    'split_config.hdpi.apk'
  );
});

test('a complete bundle without installation density fails instead of guessing', () => {
  assert.throws(() => selectDensitySplits(COMPLETE), /multiple density splits/);
});

test('a delivery containing one density split needs no extra preference', () => {
  assert.equal(
    selectDensitySplits([split('config.xxhdpi')])[0].name,
    'config.xxhdpi'
  );
});

test('architecture and language splits never participate in density choice', () => {
  const selected = selectDensitySplits([
    split('split_config.arm64_v8a.apk'),
    split('split_config.en.apk'),
    split('split_config.xxhdpi.apk')
  ], { densityDpi: 420 });
  assert.deepEqual(selected.map(x => x.name), ['split_config.xxhdpi.apk']);
});
