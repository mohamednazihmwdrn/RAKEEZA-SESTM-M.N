import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, getFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence Firestore internal logger before initialization to prevent 10s timeout warnings in console
try {
  setLogLevel('silent');
} catch {}

// Filter out harmless offline operating mode notices from browser console logs
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && (args[0].includes('Could not reach Cloud Firestore backend') || args[0].includes('Backend didn\'t respond within 10 seconds'))) {
      return;
    }
    origWarn.apply(console, args);
  };
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && (args[0].includes('Could not reach Cloud Firestore backend') || args[0].includes('Backend didn\'t respond within 10 seconds'))) {
      return;
    }
    origError.apply(console, args);
  };
}

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore strictly with database ID from configuration as specified in firebase-skill.
// Enable experimentalForceLongPolling to immediately bypass WebSocket delays in browser sandbox.
let firestoreDb;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb; /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  signInAnonymously(auth).catch((e) => {
    console.debug('Firebase Auth notice:', e?.message);
  });
}

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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default db;

