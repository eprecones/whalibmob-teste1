'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Registration = require('../lib/Registration');
const {
  checkIfRegistered,
  assertRegistrationKeys,
  requestSmsCode,
  verifyCode
} = Registration;
const { createNewStore, storeToJson, storeFromJson } = require('../lib/Store');

const PHONE = '5511999999999';

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

function offline(fn) {
  return withEnv({
    WA_OS: 'ios',
    WA_VERSION: '2.26.36.74',
    WA_REG_PACING: '0',
    WA_FUNNEL_LOG: '0',
    WA_FRIDA_HOST: undefined,
    WA_SOCKS_PROXY: undefined,
    ALL_PROXY: undefined
  }, fn);
}

function scriptedTransport(script, calls) {
  return async request => {
    calls.push(request);
    const next = script.shift();
    assert.ok(next, 'unexpected transport call to ' + request.path);
    assert.equal(request.path, next.path);
    return next.response;
  };
}

test('/exist guidance is normalized, scoped and persisted', () => offline(async () => {
  const store = createNewStore(PHONE);
  const calls = [];
  const transport = scriptedTransport([{
    path: '/exist',
    response: {
      status: 'fail',
      reason: 'incorrect',
      wa_old_eligible: 0,
      send_sms_eligible: '1',
      recommended_method: 'sms',
      fallback_methods: ['voice'],
      sms_wait: 0
    }
  }], calls);

  await checkIfRegistered(store, { _registrationTransport: transport });
  assert.equal(calls.length, 1);
  assert.equal(store.registrationState.accessSessionId, store._accessSessionId);
  assert.equal(store.registrationState.preflight, 'fresh');
  assert.deepEqual(store.registrationState.eligibility, {
    wa_old: false,
    send_sms: true
  });
  assert.equal(store.registrationState.recommendedMethod, 'sms');
  assert.deepEqual(store.registrationState.fallbackMethods, ['voice']);

  const restored = storeFromJson(storeToJson(store));
  assert.deepEqual(restored.registrationState, store.registrationState);
}));

test('the CLI preflight path records eligibility through assertRegistrationKeys', () => offline(async () => {
  const store = createNewStore(PHONE);
  const calls = [];
  const transport = scriptedTransport([{
    path: '/exist',
    response: { status: 'fail', reason: 'incorrect', wa_old_eligible: false }
  }], calls);

  assert.equal(await assertRegistrationKeys(store, undefined, {
    _registrationTransport: transport
  }), true);
  assert.equal(calls.length, 1);
  assert.equal(store.registrationState.preflight, 'fresh');
  assert.equal(store.registrationState.eligibility.wa_old, false);
}));

test('wa_old is refused locally when /exist says it is not eligible', () => offline(async () => {
  const store = createNewStore(PHONE);
  store.registrationState = {
    version: 1,
    accessSessionId: store._accessSessionId,
    checkedAt: Date.now(),
    preflight: 'fresh',
    eligibility: { wa_old: false },
    retryAt: {},
    recommendedMethod: 'sms',
    fallbackMethods: []
  };
  let calls = 0;
  const result = await requestSmsCode(store, 'wa_old', {
    _registrationTransport: async () => { calls++; return { status: 'sent' }; }
  });

  assert.equal(calls, 0);
  assert.equal(result.local, true);
  assert.equal(result.reason, 'wa_old_not_eligible');
  assert.equal(store.codePending, false);
}));

test('wa_old is refused locally until an /exist response establishes eligibility', () => offline(async () => {
  const store = createNewStore(PHONE);
  let calls = 0;
  const result = await requestSmsCode(store, 'wa_old', {
    _registrationTransport: async () => { calls++; return { status: 'sent' }; }
  });

  assert.equal(calls, 0);
  assert.equal(result.reason, 'wa_old_eligibility_unknown');
}));

test('explicit wa_old eligibility permits exactly one /code request', () => offline(async () => {
  const store = createNewStore(PHONE);
  store.registrationState = {
    version: 1,
    accessSessionId: store._accessSessionId,
    checkedAt: Date.now(),
    preflight: 'fresh',
    eligibility: { wa_old: true },
    retryAt: {},
    recommendedMethod: 'wa_old',
    fallbackMethods: []
  };
  const calls = [];
  const result = await requestSmsCode(store, 'wa_old', {
    _registrationTransport: scriptedTransport([
      { path: '/code', response: { status: 'sent' } }
    ], calls)
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'sent');
  assert.equal(store.codePending, true);
  assert.equal(store.codeMethod, 'wa_old');
}));

test('a positive method wait prevents retryUnknown and blocks another request locally', () => offline(async () => {
  const store = createNewStore(PHONE);
  const calls = [];
  const transport = scriptedTransport([{
    path: '/code',
    response: { status: 'fail', reason: 'temporary', sms_wait: 3600 }
  }], calls);

  const first = await requestSmsCode(store, 'sms', {
    retryUnknown: true,
    _registrationTransport: transport
  });
  assert.equal(calls.length, 1, 'a server cooldown is terminal even for retryUnknown');
  assert.equal(first.wait_seconds, 3600);
  assert.ok(first.retry_at > Date.now());

  const second = await requestSmsCode(store, 'sms', {
    _registrationTransport: async () => {
      calls.push({ path: '/code' });
      return { status: 'sent' };
    }
  });
  assert.equal(calls.length, 1, 'the persisted cooldown causes no second transport call');
  assert.equal(second.local, true);
  assert.equal(second.reason, 'cooldown_active');
  assert.ok(second.wait_seconds > 0);
}));

test('an explicitly allowed fallback still cannot select ineligible wa_old', () => offline(async () => {
  const store = createNewStore(PHONE);
  store.registrationState = {
    version: 1,
    accessSessionId: store._accessSessionId,
    checkedAt: Date.now(),
    preflight: 'fresh',
    eligibility: { wa_old: false },
    retryAt: {},
    recommendedMethod: 'sms',
    fallbackMethods: []
  };
  const calls = [];
  const result = await requestSmsCode(store, 'sms', {
    allowMethodFallback: true,
    _registrationTransport: scriptedTransport([
      { path: '/code', response: { status: 'fail', reason: 'no_routes' } }
    ], calls)
  });

  assert.equal(calls.length, 1);
  assert.equal(result.local, true);
  assert.equal(result.reason, 'wa_old_not_eligible');
}));

test('verifyCode rejects a missing store before transport, version or APK work', async () => {
  let calls = 0;
  await assert.rejects(
    () => verifyCode(null, '123456', {
      _registrationTransport: async () => { calls++; return { status: 'ok' }; }
    }),
    /same persisted registration store/
  );
  assert.equal(calls, 0);
});


test('offline smoke keeps one store through /exist, /code and /register', () => offline(async () => {
  const store = createNewStore(PHONE);
  const accessSessionId = store._accessSessionId;
  const calls = [];
  const transport = scriptedTransport([
    {
      path: '/exist',
      response: { status: 'fail', reason: 'incorrect', wa_old_eligible: 0 }
    },
    {
      path: '/code',
      response: { status: 'sent', method: 'sms' }
    },
    {
      path: '/register',
      response: { status: 'verified' }
    }
  ], calls);
  const opts = { _registrationTransport: transport };

  const preflight = await checkIfRegistered(store, opts);
  assert.equal(preflight.reason, 'incorrect');
  assert.equal(store._accessSessionId, accessSessionId);

  const requested = await requestSmsCode(store, 'sms', opts);
  assert.equal(requested.status, 'sent');
  assert.equal(store.codePending, true);
  assert.equal(store._accessSessionId, accessSessionId);

  const registered = await verifyCode(store, '123456', opts);
  assert.equal(registered.status, 'verified');
  assert.equal(registered.store, store);
  assert.equal(store.registered, true);
  assert.equal(store.codePending, false);
  assert.equal(store.registrationState, null);
  assert.equal(store._accessSessionId, accessSessionId);
  assert.deepEqual(calls.map(call => call.path), ['/exist', '/code', '/register']);
}));


test('Android registration version is taken from the APK material', () => {
  const choose = Registration._token.registrationVersionFromMaterial;
  assert.equal(choose({ apkVersion: '2.26.30.97' }, null, 'WA_VERSION'), '2.26.30.97');
  assert.equal(
    choose({ apkVersion: '2.26.30.97' }, '2.26.30.97', 'WA_VERSION'),
    '2.26.30.97'
  );
});

test('a conflicting Android registration version fails before any endpoint', () => {
  const choose = Registration._token.registrationVersionFromMaterial;
  assert.throws(
    () => choose({ apkVersion: '2.26.30.97' }, '2.26.36.72', 'WA_VERSION'),
    /Android registration version mismatch.*WA_VERSION/
  );
});

test('a manifest without versionName can still use an explicit candidate', () => {
  const choose = Registration._token.registrationVersionFromMaterial;
  assert.equal(choose({ apkVersion: null }, '2.26.30.97', 'WA_VERSION'), '2.26.30.97');
  assert.equal(choose(null, null, 'WA_VERSION'), null);
});


test('an Android WA_VERSION conflict stops before /exist transport', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-reg-version-'));
  const materialFile = path.join(dir, 'android-apk-material.json');
  fs.writeFileSync(materialFile, JSON.stringify({
    packageName: 'com.whatsapp',
    secretKey: Buffer.alloc(64).toString('base64'),
    classesDexMd5: Buffer.alloc(16).toString('base64'),
    certificates: [Buffer.from([1]).toString('base64')],
    apkVersion: '2.26.30.97',
    apkVersionCode: 263009720
  }));

  try {
    await withEnv({
      WA_OS: 'android',
      WA_VERSION: '2.26.36.72',
      WA_ANDROID_APK_MATERIAL: materialFile,
      WA_NO_APK_DOWNLOAD: '1',
      WA_REG_PACING: '0',
      WA_FUNNEL_LOG: '0',
      WA_FRIDA_HOST: undefined
    }, async () => {
      const store = createNewStore(PHONE);
      let calls = 0;
      await assert.rejects(
        () => checkIfRegistered(store, {
          _registrationTransport: async () => {
            calls++;
            return { status: 'fail', reason: 'incorrect' };
          }
        }),
        /Android registration version mismatch.*WA_VERSION/
      );
      assert.equal(calls, 0);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('/code and /register reuse the fresh /exist version when WA_VERSION changes', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-reg-frozen-version-'));
  const materialFile = path.join(dir, 'android-apk-material.json');
  fs.writeFileSync(materialFile, JSON.stringify({
    packageName: 'com.whatsapp',
    secretKey: Buffer.alloc(64).toString('base64'),
    classesDexMd5: Buffer.alloc(16).toString('base64'),
    certificates: [Buffer.from([1]).toString('base64')],
    apkVersion: '2.26.30.97',
    apkVersionCode: 263009720
  }));

  try {
    await withEnv({
      WA_OS: 'android',
      WA_VERSION: '2.26.36.72',
      WA_ANDROID_APK_MATERIAL: materialFile,
      WA_NO_APK_DOWNLOAD: '1',
      WA_FCM_PUSH: '0',
      WA_REG_PACING: '0',
      WA_FUNNEL_LOG: '0',
      WA_FRIDA_HOST: undefined
    }, async () => {
      const store = createNewStore(PHONE);
      store.version = '2.26.30.97';
      store.registrationState = {
        version: 1,
        accessSessionId: store._accessSessionId,
        checkedAt: Date.now(),
        preflight: 'fresh',
        eligibility: { wa_old: false },
        retryAt: {},
        recommendedMethod: 'sms',
        fallbackMethods: []
      };

      const calls = [];
      const opts = {
        _registrationTransport: async request => {
          calls.push(request);
          return request.path === '/code'
            ? { status: 'sent' }
            : { status: 'verified' };
        }
      };
      const result = await requestSmsCode(store, 'sms', opts);
      assert.equal(result.status, 'sent');
      const registered = await verifyCode(store, '123456', opts);
      assert.equal(registered.status, 'verified');
      assert.deepEqual(calls.map(call => call.path), ['/code', '/register']);
      assert.deepEqual(calls.map(call => call.waVersion), [
        '2.26.30.97',
        '2.26.30.97'
      ]);
      assert.equal(store.version, '2.26.30.97');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('sms wait aliases produce one canonical wait and deadline', () => {
  const store = createNewStore(PHONE);
  const now = 1700000000000;
  const guidance = Registration._verify.recordRegistrationResponse(
    store,
    { sms_wait: 10, send_sms_wait: 90 },
    'code',
    'sms',
    now
  );
  assert.equal(guidance.waitSeconds, 90);
  assert.equal(guidance.retryAt, now + 90000);
  assert.equal(store.registrationState.retryAt.sms, now + 90000);
});


test('a consent gate clears the consumed pending code', () => offline(async () => {
  const store = createNewStore(PHONE);
  store.codePending = true;
  store.codeMethod = 'sms';
  store.version = '2.26.36.74';
  const calls = [];
  await assert.rejects(
    () => verifyCode(store, '123456', {
      _registrationTransport: scriptedTransport([{
        path: '/register',
        response: { status: 'fail', reason: 'consent', pending: 'app_store_age' }
      }], calls)
    }),
    /age-consent signal/
  );
  assert.equal(calls.length, 1);
  assert.equal(store.codePending, false);
  assert.equal(store.codeMethod, null);
}));
