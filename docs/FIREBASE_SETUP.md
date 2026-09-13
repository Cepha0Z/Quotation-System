# Firebase production setup

The application uses Firebase Authentication and Realtime Database. It does not use Firebase Admin credentials in the browser.

## Environment

Copy `.env.example` to `.env.local` and fill every value from Firebase Console → Project settings → Your apps → Web app. The Realtime Database URL must match the database instance created for `nebulous-boq`.

## Authentication

Keep Email/Password enabled. Add every production hostname (including `interix-quotation-studio.cephajj.chatgpt.site`) under Authentication → Settings → Authorized domains.

New accounts create a `/users/{uid}` profile with role `employee`. To bootstrap the first boss account:

1. Create/sign in to the account once in the app.
2. In Realtime Database, change `/users/{uid}/role` from `employee` to `admin`.
3. Sign out and back in so the app reloads the profile.

Only an existing admin or Firebase Console can promote another account.

## Database rules

Publish `database.rules.json` to the Realtime Database Rules tab before production use. The file defaults to deny and separates technical and financial data so employees cannot read or write financial values.

## Project access

Project creators receive their own `/userProjects/{uid}/{projectId}: true` link automatically. To assign an existing project to another employee, add the same link for that employee in Realtime Database. Removing the link removes their access.

## Local migration

The old IndexedDB data is not deleted. An admin who signs in on a device containing local projects sees an explicit one-time **Import local data** action. Existing Firebase IDs win; conflicting local records are skipped rather than overwritten.
