/**
 * Central Firestore Write Utility
 * 
 * ALL Firestore writes must route through these functions.
 * They automatically inject businessId, branchId, timestamps,
 * createdBy, run validation, and log to the audit trail.
 * 
 * Audit log writes are EXEMPT (to avoid infinite loops).
 */

import { addDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { collection, doc } from 'firebase/firestore';
import { writeAuditLog } from '../hooks/useAuditLog';
import { isPermissionDenied } from './handleFirestoreError';

/**
 * createDocument — Adds a new document to a collection.
 * 
 * @param {CollectionReference} collectionRef - Firestore collection reference
 * @param {object} data - The document data
 * @param {object} options
 * @param {string} options.businessId - Current business ID (required)
 * @param {string} options.branchId - Current branch ID (optional)
 * @param {object} options.user - Firebase Auth user object
 * @param {string} options.role - Current user role
 * @param {function} options.validator - Validator function from validators.js
 * @param {string} options.collectionName - Human-readable collection name (for audit)
 * @param {string} options.summaryField - Field to use in audit summary (e.g. 'name')
 * @param {boolean} options.skipAudit - Skip audit logging (for audit log writes themselves)
 * @returns {DocumentReference} The created document reference
 */
export async function createDocument(collectionRef, data, options = {}) {
  const {
    businessId,
    branchId,
    user,
    role,
    validator,
    collectionName = 'document',
    summaryField = 'name',
    skipAudit = false,
  } = options;

  // Validate
  let finalData = { ...data };
  if (validator) {
    const result = validator(finalData);
    if (!result.valid) {
      const err = new Error(`Validation failed: ${result.errors.join(', ')}`);
      err.validationErrors = result.errors;
      err.code = 'validation-failed';
      throw err;
    }
    finalData = result.sanitizedData;
  }

  // Inject scoping & metadata
  if (businessId) finalData.businessId = businessId;
  if (branchId) finalData.branchId = branchId;
  finalData.createdAt = serverTimestamp();
  finalData.updatedAt = serverTimestamp();
  if (user?.uid) finalData.createdBy = user.uid;

  try {
    const docRef = await addDoc(collectionRef, finalData);

    // Audit log (best-effort, never blocks main write)
    if (!skipAudit && user) {
      const summaryValue = finalData[summaryField] || docRef.id;
      writeAuditLog(
        user, role,
        `${collectionName} created`,
        `Created ${collectionName}: ${summaryValue}`,
        collectionName,
        businessId
      ).catch(() => {}); // silent
    }

    return docRef;
  } catch (err) {
    console.error(`[firestoreWrite] createDocument failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * updateDocument — Updates an existing document.
 * 
 * @param {DocumentReference} docRef - Firestore document reference
 * @param {object} data - Fields to update
 * @param {object} options - Same as createDocument (businessId not re-injected on updates)
 */
export async function updateDocument(docRef, data, options = {}) {
  const {
    businessId,
    user,
    role,
    validator,
    collectionName = 'document',
    summaryField = 'name',
    skipAudit = false,
  } = options;

  // Validate (for updates, missing required fields are OK — only validate what's provided)
  let finalData = { ...data };
  if (validator) {
    const result = validator(finalData);
    if (!result.valid) {
      const err = new Error(`Validation failed: ${result.errors.join(', ')}`);
      err.validationErrors = result.errors;
      err.code = 'validation-failed';
      throw err;
    }
    finalData = result.sanitizedData;
  }

  // Inject metadata
  finalData.updatedAt = serverTimestamp();

  try {
    await updateDoc(docRef, finalData);

    // Audit log
    if (!skipAudit && user) {
      const summaryValue = finalData[summaryField] || docRef.id;
      writeAuditLog(
        user, role,
        `${collectionName} updated`,
        `Updated ${collectionName}: ${summaryValue}`,
        collectionName,
        businessId
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`[firestoreWrite] updateDocument failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * setDocument — Sets (creates or overwrites) a document at a specific path.
 * 
 * @param {DocumentReference} docRef - Firestore document reference
 * @param {object} data - The document data
 * @param {object} options - Same as createDocument
 * @param {object} setOptions - Firestore setDoc options (e.g. { merge: true })
 */
export async function setDocument(docRef, data, options = {}, setOptions = { merge: true }) {
  const {
    businessId,
    branchId,
    user,
    role,
    validator,
    collectionName = 'document',
    summaryField = 'name',
    skipAudit = false,
  } = options;

  let finalData = { ...data };
  if (validator) {
    const result = validator(finalData);
    if (!result.valid) {
      const err = new Error(`Validation failed: ${result.errors.join(', ')}`);
      err.validationErrors = result.errors;
      err.code = 'validation-failed';
      throw err;
    }
    finalData = result.sanitizedData;
  }

  // Inject scoping & metadata
  if (businessId) finalData.businessId = businessId;
  if (branchId) finalData.branchId = branchId;
  finalData.updatedAt = serverTimestamp();

  try {
    await setDoc(docRef, finalData, setOptions);

    if (!skipAudit && user) {
      const summaryValue = finalData[summaryField] || docRef.id;
      writeAuditLog(
        user, role,
        `${collectionName} saved`,
        `Saved ${collectionName}: ${summaryValue}`,
        collectionName,
        businessId
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`[firestoreWrite] setDocument failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Helper: Check if a write error is a permission-denied (Pro gating) error.
 */
export { isPermissionDenied };
