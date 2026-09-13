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

Project creators receive their own `/userProjects/{uid}/{projectId}: true` link atomically with project creation. Employee creation does not require reading an unassigned project.

As an admin, open the project's Builder → project actions (three dots) → **Assign employees**. Select employees and save. Employees appear after they have signed in at least once and created their app profile. Assignment grants technical access only; it never grants financial access.

Assignments update both `/userProjects/{uid}/{projectId}` (discovery) and `/projectMembers/{projectId}/{uid}` (membership) in one atomic write. Removing an assignment deletes both links. If maintaining assignments manually, always update/remove both links. A legacy membership-only assignment is not discoverable by the employee; opening the dialog and saving repairs inconsistent links for listed employees.

Publish the updated rules together with the application update: the rules permit an employee's own creation link only when the project is also newly created in that atomic write. Admin-only user-directory reads support the assignment picker. No financial permissions have changed.

## Local permission regression tests

`npm run test:firebase-security` checks serialization, financial separation and merge behavior. For actual Firebase rules enforcement, start a Realtime Database emulator at `127.0.0.1:9000`, then run `node scripts/verify-firebase-emulator.mjs`. The latter loads the repository rules into a unique `demo-boq-*` namespace and exercises production persistence functions with simulated admin, employee, unrelated-user and independent-client sessions. It never uses production configuration or accounts.

## Local migration

The old IndexedDB data is not deleted. An admin who signs in on a device containing local projects sees an explicit one-time **Import local data** action. Existing Firebase IDs win; conflicting local records are skipped rather than overwritten.
