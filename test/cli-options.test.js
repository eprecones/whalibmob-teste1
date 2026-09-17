'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolvePlatformOption,
  hasFreshRegistrationPreflight,
  requirePendingRegistrationStore,
  resolveRegistrationStoreOptions
} = require('../tools/CliOptions');

test('platform aliases resolve to one source of truth', () => {
  assert.equal(resolvePlatformOption({ platform: 'iphone' }), 'ios');
  assert.equal(resolvePlatformOption({ platform: 'ios' }), 'ios');
  assert.equal(resolvePlatformOption({ iphone: true }), 'ios');
  assert.equal(resolvePlatformOption({ ios: true }), 'ios');
  assert.equal(resolvePlatformOption({ android: true }), 'android');
  assert.equal(resolvePlatformOption({}), null);
});

test('equivalent iPhone spellings can be combined', () => {
  assert.equal(resolvePlatformOption({ platform: 'iphone', ios: true }), 'ios');
});

test('every contradictory platform combination is rejected', () => {
  assert.throws(
    () => resolvePlatformOption({ platform: 'ios', android: true }),
    /conflicting platform options/
  );
  assert.throws(
    () => resolvePlatformOption({ platform: 'android', iphone: true }),
    /conflicting platform options/
  );
  assert.throws(
    () => resolvePlatformOption({ ios: true, android: true }),
    /conflicting platform options/
  );
});

test('missing and invalid --platform values are rejected', () => {
  assert.throws(() => resolvePlatformOption({ platform: true }), /must be/);
  assert.throws(() => resolvePlatformOption({ platform: 'windows' }), /must be/);
});

test('only a preflight for the current access session is reusable', () => {
  const store = {
    _accessSessionId: 'current',
    registrationState: { accessSessionId: 'current', preflight: 'fresh' }
  };
  assert.equal(hasFreshRegistrationPreflight(store), true);
  store.registrationState.accessSessionId = 'old';
  assert.equal(hasFreshRegistrationPreflight(store), false);
  store.registrationState.accessSessionId = 'current';
  store.registrationState.preflight = 'unknown';
  assert.equal(hasFreshRegistrationPreflight(store), false);
});

test('confirmation requires the persisted store and a pending code', () => {
  assert.throws(() => requirePendingRegistrationStore(null), /session not found/);
  assert.throws(() => requirePendingRegistrationStore({ codePending: false }), /no pending code/);
  const store = { codePending: true };
  assert.equal(requirePendingRegistrationStore(store), store);
});


test('registration SIM flags preserve valid MCC/MNC width', () => {
  assert.deepEqual(resolveRegistrationStoreOptions({
    'sim-mcc': '724',
    'sim-mnc': '05'
  }, 'Ana'), {
    name: 'Ana',
    simMcc: '724',
    simMnc: '05'
  });
  assert.equal(resolveRegistrationStoreOptions({ 'sim-mnc': '010' }).simMnc, '010');
});

test('registration SIM flags require values and numeric wire shapes', () => {
  assert.throws(
    () => resolveRegistrationStoreOptions({ 'sim-mcc': true }),
    /--sim-mcc requires a value/
  );
  assert.throws(
    () => resolveRegistrationStoreOptions({ 'sim-mnc': true }),
    /--sim-mnc requires a value/
  );
  assert.throws(
    () => resolveRegistrationStoreOptions({ 'sim-mcc': '72A' }),
    /exactly 3 digits/
  );
  assert.throws(
    () => resolveRegistrationStoreOptions({ 'sim-mnc': '1' }),
    /2 or 3 digits/
  );
});
