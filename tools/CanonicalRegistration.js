'use strict';

const fs = require('fs');
const path = require('path');
const { loadStore, saveStore } = require('../lib/Store');

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sameBuffer(left, right) {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
}

/** Compare only immutable credentials generated as one registration identity. */
function sameRegistrationIdentity(left, right) {
  if (!left || !right) return false;
  return Number(left.registrationId) === Number(right.registrationId) &&
    String(left.fdid || '') === String(right.fdid || '') &&
    sameBuffer(left.deviceId, right.deviceId) &&
    sameBuffer(left.identityId, right.identityId) &&
    sameBuffer(left.noiseKeyPair && left.noiseKeyPair.public,
      right.noiseKeyPair && right.noiseKeyPair.public) &&
    sameBuffer(left.identityKeyPair && left.identityKeyPair.public,
      right.identityKeyPair && right.identityKeyPair.public) &&
    Number(left.signedPreKey && left.signedPreKey.id) ===
      Number(right.signedPreKey && right.signedPreKey.id) &&
    sameBuffer(left.signedPreKey && left.signedPreKey.public,
      right.signedPreKey && right.signedPreKey.public) &&
    sameBuffer(left.signedPreKey && left.signedPreKey.signature,
      right.signedPreKey && right.signedPreKey.signature);
}

function storeCandidates(baseDir, phone) {
  const normalized = digits(phone);
  return [
    path.join(baseDir, normalized + '.json'),
    path.join(baseDir, normalized, normalized + '.json')
  ];
}

function existingStoreFile(baseDir, phone, label) {
  const existing = storeCandidates(baseDir, phone).filter(file => fs.existsSync(file));
  if (existing.length > 1) {
    throw new Error('Cannot finalize registration: ambiguous ' + label + ' session layout');
  }
  return existing[0] || null;
}

function verifyFinalStore(file, expected, canonical) {
  const reloaded = loadStore(file);
  if (!reloaded || !sameRegistrationIdentity(reloaded, expected)) {
    throw new Error('Cannot finalize registration: canonical Store identity check failed');
  }
  if (!reloaded.registered || digits(reloaded.phoneNumber) !== canonical) {
    throw new Error('Cannot finalize registration: canonical Store state check failed');
  }
  return reloaded;
}

/**
 * Persist a successfully registered Store under the server's canonical number.
 *
 * Only the mobile auth Store is finalized here. Auxiliary, companion, pre-key,
 * cache, history, app-state, shared, and unknown files are deliberately left
 * untouched because the mobile Store identity does not prove their ownership.
 */
function finalizeCanonicalRegistration(baseDir, typedPhone, finalStore) {
  const typed = digits(typedPhone);
  const canonical = digits(finalStore && finalStore.phoneNumber);
  if (!typed || !canonical) throw new Error('Cannot finalize registration: phone number missing');
  if (!finalStore || !finalStore.registered) {
    throw new Error('Cannot finalize registration: Store is not registered');
  }

  const sourceFile = existingStoreFile(baseDir, typed, 'source');
  if (!sourceFile) throw new Error('Cannot finalize registration: source Store is missing');
  const sourceStore = loadStore(sourceFile);
  if (!sourceStore || !sameRegistrationIdentity(sourceStore, finalStore)) {
    throw new Error('Cannot finalize registration: source Store identity changed');
  }

  if (typed === canonical) {
    saveStore(finalStore, sourceFile);
    verifyFinalStore(sourceFile, finalStore, canonical);
    return { phoneNumber: canonical, storeFile: sourceFile, removedSource: false, leftBehind: [] };
  }

  let destinationFile = existingStoreFile(baseDir, canonical, 'destination');
  if (destinationFile) {
    const destinationStore = loadStore(destinationFile);
    if (!destinationStore || !sameRegistrationIdentity(destinationStore, finalStore)) {
      throw new Error('Cannot finalize registration: canonical destination belongs to another identity');
    }
  } else {
    const destinationDir = path.join(baseDir, canonical);
    fs.mkdirSync(destinationDir, { recursive: true });
    destinationFile = path.join(destinationDir, canonical + '.json');
  }

  // Destination first. The source remains a complete recovery point until the
  // canonical file has been written, reloaded, and proven to be the same Store.
  saveStore(finalStore, destinationFile);
  verifyFinalStore(destinationFile, finalStore, canonical);

  // Re-read immediately before deletion so a concurrent replacement cannot be
  // removed merely because the earlier snapshot matched.
  const sourceBeforeDelete = loadStore(sourceFile);
  if (!sourceBeforeDelete || !sameRegistrationIdentity(sourceBeforeDelete, finalStore)) {
    throw new Error('Cannot finalize registration: source Store changed before cleanup');
  }
  fs.unlinkSync(sourceFile);

  const sourceDir = path.dirname(sourceFile);
  let leftBehind = [];
  if (path.resolve(sourceDir) !== path.resolve(baseDir)) {
    try { leftBehind = fs.readdirSync(sourceDir); } catch (_) { leftBehind = []; }
    if (leftBehind.length === 0) {
      try { fs.rmdirSync(sourceDir); } catch (_) {}
    }
  }

  return {
    phoneNumber: canonical,
    storeFile: destinationFile,
    removedSource: true,
    leftBehind
  };
}

module.exports = {
  sameRegistrationIdentity,
  finalizeCanonicalRegistration,
  _storeCandidates: storeCandidates
};
