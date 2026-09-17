'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Attestation = require('../lib/Attestation');
const Registration = require('../lib/Registration');
const { createNewStore } = require('../lib/Store');

function withEnv(vars, fn) {
  const saved = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  let result;
  try { result = fn(); } catch (error) { restore(); throw error; }
  return result && typeof result.then === 'function'
    ? result.finally(restore)
    : (restore(), result);
}

test('disabled attestation exposes no body signature or authorization header', () =>
  withEnv({ WA_FRIDA_HOST: undefined }, async () => {
    const result = await Attestation.attestBody('enc', { os: 'android' }, {
      noisePubB64: 'noise'
    });
    assert.deepEqual(result, {
      bodyAttestation: null,
      authorizationHeader: null
    });
  }));

test('unavailable Android attestation fields are omitted from the plaintext payload', () =>
  withEnv({
    WA_OS: 'android',
    WA_FRIDA_HOST: undefined,
    WA_FCM_PUSH: '0'
  }, async () => {
    const store = createNewStore('40711111111');
    const payload = await Registration._token.buildPayload(
      store,
      '2.26.30.97',
      false,
      null
    );
    assert.doesNotMatch(payload, /(?:^|&)gpia=/);
    assert.doesNotMatch(payload, /(?:^|&)_g[gipea]=/);
    assert.doesNotMatch(payload, /(?:^|&)push_token=/);
  }));
