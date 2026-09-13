import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseEnvironmentNames: Record<keyof typeof firebaseConfig, string> = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};

export const missingFirebaseEnvironment = (
  Object.keys(firebaseConfig) as (keyof typeof firebaseConfig)[]
)
  .filter((key) => !firebaseConfig[key])
  .map((key) => firebaseEnvironmentNames[key]);

export const firebaseConfigured = missingFirebaseEnvironment.length === 0;

let services: { app: FirebaseApp; auth: Auth; database: Database } | null =
  null;

export function getFirebaseServices() {
  if (!firebaseConfigured || typeof window === 'undefined') return null;
  if (services) return services;
  const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig as Record<string, string>);
  services = { app, auth: getAuth(app), database: getDatabase(app) };
  return services;
}
