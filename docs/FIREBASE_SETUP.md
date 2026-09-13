# Firebase production setup

The app uses Firebase Authentication and Realtime Database directly from React. It requires no Cloud Functions, custom backend, Admin SDK, service-account credentials, or Blaze upgrade.

## Environment and roles

Copy `.env.example` to `.env.local` and fill every value from Firebase Console → Project settings → Your apps → Web app. Use the correct database URL. Keep Email/Password authentication enabled and add production hostnames to Authentication → Settings → Authorized domains.

New users get `/users/{uid}/role: employee`. To bootstrap an admin, sign in once, change that profile's role to `admin` in Firebase Console, then sign out and back in. Only admins or Firebase Console can promote users.

## Rules and assignment

Publish `database.rules.json` before production use. Employee financial UI remains hidden. The existing financial read/write restrictions are also retained; the simplified rate handling does not require relaxing them.

Creators get their own `userProjects` link atomically with technical project creation. Admins assign employees using Builder → project actions → **Assign employees**. Assignment updates both `/userProjects/{uid}/{projectId}` and `/projectMembers/{projectId}/{uid}`; revocation removes both. Employees appear in the picker after signing in once. Save the assignment dialog to repair older inconsistent membership/discovery links.

## Master rates and overrides

New template-backed items store a template reference and financial `rateSource: template`. The admin workspace resolves their rates from the current master rate card whenever projects or rates change. Calculations, previews and exporters receive that resolved project data. Editing the master updates linked items; project snapshots are not themselves master templates.

An item's explicit `rateOverride` takes precedence, including an intentional zero. **Use master rate** removes that override and explicitly links the item to its template. Legacy financial records without a source marker stay project-specific; the app cannot safely infer whether a historical stored rate was an intentional override. Existing fees and prices are never replaced just because they differ from today's master.

Bundled template IDs are stable across browsers. Legacy random template IDs may resolve by a unique name/unit match. Unresolvable historical references require admin review rather than guessing a rate.

## Employee projects and missing financial records

Employees create the same technical projects/items that admins later open. On loading the workspace, the authenticated admin client supplies missing financial defaults and saves them with missing-only transactions. It also does this for new technical items arriving through realtime updates. This uses the existing admin permissions—no background service.

Until an admin opens the app, an employee-only project's financial records may not yet be persisted. The admin sees the resolved defaults immediately on loading, and the client then saves them. Connection/permission failures are reported. No separate deployment or billing feature is required.

The normal new-project fee list is shared with this initialization. A completely missing financial record gets default fees; existing records, including empty fee structures, are preserved to avoid overwriting intentional edits. `feesInitialized` retains that choice. Historical projects with ambiguous stored zeros/empty fees require admin review.

## Tests

Run `npx tsc --noEmit`, `npm run test:firebase-security`, `npm run test:excel-export`, and `npm run build:ios`. For real database-rules checks, start the Realtime Database emulator at `127.0.0.1:9000` and run `node scripts/verify-firebase-emulator.mjs`. Tests use isolated `demo-boq-*` namespaces and simulated accounts, not production credentials.

## Local migration

IndexedDB projects are not deleted. An admin on a device containing local data can use **Import local data**. Existing Firebase IDs win and conflicting local projects are skipped. Imported legacy financial values remain project-specific until explicitly linked to the master rate.
