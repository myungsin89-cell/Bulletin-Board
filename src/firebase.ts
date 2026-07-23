import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import fallbackConfig from '../firebase-applet-config.json';

// Dynamic config resolution: localStorage has higher priority
let firebaseConfig: any = null;
const storedConfigStr = localStorage.getItem('sb_firebase_config');
if (storedConfigStr) {
  try {
    firebaseConfig = JSON.parse(storedConfigStr);
  } catch (e) {
    console.error("Failed to parse stored firebase config", e);
  }
}

// Fallback to static config if no localStorage config exists
if (!firebaseConfig && fallbackConfig && fallbackConfig.projectId) {
  firebaseConfig = fallbackConfig;
}

// Auto-reconstruct databaseURL if it is missing in the configuration (required for Realtime Database)
if (firebaseConfig && !firebaseConfig.databaseURL && firebaseConfig.projectId) {
  firebaseConfig.databaseURL = `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;
}

export const isFirebaseConfigured = !!(
  firebaseConfig &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId !== ""
);

let db: any = null;
let rtdb: any = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
        db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      } else {
        db = getFirestore(app);
      }
    } catch (e) {
      db = getFirestore(app);
    }
    
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firebase persistence failed: multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firebase persistence failed: unsupported browser');
      }
    });

    rtdb = getDatabase(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export { db, rtdb, firebaseConfig };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let userId = null;
  try {
    const stored = localStorage.getItem('teacher_profile');
    if (stored) {
      userId = JSON.parse(stored).uid;
    }
  } catch (e) {}

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
