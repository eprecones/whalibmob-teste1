'use strict';

function normalizePlatform(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'iphone' ? 'ios' : normalized;
}

/** Resolve --platform and its shortcuts without silently preferring one. */
function resolvePlatformOption(flags) {
  flags = flags || {};
  const requested = [];

  if (flags.platform !== undefined) {
    if (flags.platform === true) {
      throw new Error('--platform must be iphone, ios, or android');
    }
    requested.push(normalizePlatform(flags.platform));
  }
  if (flags.iphone || flags.ios) requested.push('ios');
  if (flags.android) requested.push('android');

  for (const platform of requested) {
    if (platform !== 'ios' && platform !== 'android') {
      throw new Error('--platform must be iphone, ios, or android');
    }
  }
  const distinct = [...new Set(requested)];
  if (distinct.length > 1) {
    throw new Error('conflicting platform options; choose iPhone/iOS or Android, not both');
  }
  return distinct[0] || null;
}

function hasFreshRegistrationPreflight(store) {
  if (!store || !store.registrationState) return false;
  const state = store.registrationState;
  return state.accessSessionId === store._accessSessionId && state.preflight === 'fresh';
}

function requirePendingRegistrationStore(store) {
  if (!store) {
    throw new Error('registration session not found; request the code first');
  }
  if (!store.codePending) {
    throw new Error('this registration session has no pending code; request the code first');
  }
  return store;
}

function normalizeSimFlag(value, flag, pattern, shape) {
  if (value === undefined) return null;
  if (value === true || value === null) {
    throw new Error(flag + ' requires a value');
  }
  const normalized = String(value).trim();
  if (!pattern.test(normalized)) {
    throw new Error(flag + ' must be ' + shape);
  }
  return normalized;
}

function resolveRegistrationStoreOptions(flags, name) {
  flags = flags || {};
  return {
    name: name || null,
    simMcc: normalizeSimFlag(flags['sim-mcc'], '--sim-mcc', /^\d{3}$/, 'exactly 3 digits'),
    simMnc: normalizeSimFlag(flags['sim-mnc'], '--sim-mnc', /^\d{2,3}$/, '2 or 3 digits')
  };
}

module.exports = {
  normalizePlatform,
  resolvePlatformOption,
  hasFreshRegistrationPreflight,
  requirePendingRegistrationStore,
  resolveRegistrationStoreOptions
};
