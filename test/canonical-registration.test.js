'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createNewStore, saveStore, loadStore, storeToJson, storeFromJson } = require('../lib/Store');
const {
  sameRegistrationIdentity,
  finalizeCanonicalRegistration
} = require('../tools/CanonicalRegistration');

function tempBase(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-canonical-' + label + '-'));
}

function sourceFile(base, phone) {
  const dir = path.join(base, phone);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, phone + '.json');
}

function pendingStore(phone) {
  const store = createNewStore(phone);
  store.codePending = true;
  store.codeMethod = 'sms';
  return store;
}

function finalStoreFrom(store, canonical) {
  store.phoneNumber = canonical;
  store.registered = true;
  store.codePending = false;
  store.codeMethod = null;
  return store;
}

test('canonical finalization writes and verifies destination before removing source', () => {
  const base = tempBase('basic');
  const typed = '10001', canonical = '10002';
  const store = pendingStore(typed);
  const from = sourceFile(base, typed);
  saveStore(store, from);

  const result = finalizeCanonicalRegistration(base, typed, finalStoreFrom(store, canonical));
  assert.equal(result.phoneNumber, canonical);
  assert.equal(result.removedSource, true);
  assert.equal(fs.existsSync(from), false);
  assert.equal(fs.existsSync(path.dirname(from)), false, 'empty source directory is removed non-recursively');

  const persisted = loadStore(result.storeFile);
  assert.equal(persisted.phoneNumber, canonical);
  assert.equal(persisted.registered, true);
  assert.equal(sameRegistrationIdentity(persisted, store), true);
});

test('canonical finalization leaves auxiliary and companion files untouched', () => {
  const base = tempBase('aux');
  const typed = '20001', canonical = '20002';
  const store = pendingStore(typed);
  const from = sourceFile(base, typed);
  saveStore(store, from);
  const signal = path.join(path.dirname(from), typed + '.signal.json');
  const web = path.join(path.dirname(from), typed + '.web.json');
  fs.writeFileSync(signal, 'signal-data');
  fs.writeFileSync(web, 'companion-data');

  const result = finalizeCanonicalRegistration(base, typed, finalStoreFrom(store, canonical));
  assert.equal(fs.existsSync(from), false);
  assert.equal(fs.readFileSync(signal, 'utf8'), 'signal-data');
  assert.equal(fs.readFileSync(web, 'utf8'), 'companion-data');
  assert.deepEqual(result.leftBehind.sort(), [path.basename(signal), path.basename(web)].sort());
});

test('a canonical destination with another identity aborts before any write', () => {
  const base = tempBase('collision');
  const typed = '30001', canonical = '30002';
  const source = pendingStore(typed);
  const from = sourceFile(base, typed);
  saveStore(source, from);
  const destination = createNewStore(canonical);
  destination.registered = true;
  const to = sourceFile(base, canonical);
  saveStore(destination, to);
  const beforeFrom = fs.readFileSync(from);
  const beforeTo = fs.readFileSync(to);

  assert.throws(
    () => finalizeCanonicalRegistration(base, typed, finalStoreFrom(source, canonical)),
    /destination belongs to another identity/
  );
  assert.deepEqual(fs.readFileSync(from), beforeFrom);
  assert.deepEqual(fs.readFileSync(to), beforeTo);
});

test('a canonical destination with the same identity is idempotently updated', () => {
  const base = tempBase('same');
  const typed = '40001', canonical = '40002';
  const source = pendingStore(typed);
  const from = sourceFile(base, typed);
  saveStore(source, from);
  const same = storeFromJson(storeToJson(source));
  same.phoneNumber = canonical;
  const to = sourceFile(base, canonical);
  saveStore(same, to);

  const result = finalizeCanonicalRegistration(base, typed, finalStoreFrom(source, canonical));
  assert.equal(result.storeFile, to);
  assert.equal(fs.existsSync(from), false);
  const persisted = loadStore(to);
  assert.equal(persisted.registered, true);
  assert.equal(sameRegistrationIdentity(persisted, source), true);
});

test('ambiguous flat and per-number source layouts fail without mutation', () => {
  const base = tempBase('ambiguous');
  const typed = '50001', canonical = '50002';
  const store = pendingStore(typed);
  const flat = path.join(base, typed + '.json');
  const nested = sourceFile(base, typed);
  saveStore(store, flat);
  saveStore(store, nested);
  const beforeFlat = fs.readFileSync(flat);
  const beforeNested = fs.readFileSync(nested);

  assert.throws(
    () => finalizeCanonicalRegistration(base, typed, finalStoreFrom(store, canonical)),
    /ambiguous source session layout/
  );
  assert.deepEqual(fs.readFileSync(flat), beforeFlat);
  assert.deepEqual(fs.readFileSync(nested), beforeNested);
});

test('an already canonical Store is verified in place', () => {
  const base = tempBase('in-place');
  const phone = '60001';
  const store = pendingStore(phone);
  const file = sourceFile(base, phone);
  saveStore(store, file);

  const result = finalizeCanonicalRegistration(base, phone, finalStoreFrom(store, phone));
  assert.equal(result.storeFile, file);
  assert.equal(result.removedSource, false);
  assert.equal(loadStore(file).registered, true);
});
