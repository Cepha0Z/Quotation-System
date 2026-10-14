# UI and Excel review — 14 October 2026

## Scope

This pass polishes the existing application, not its financial or Firebase architecture.
No database rules, pricing resolver, persistence functions, or project records were changed.

Excel now uses Arial, a white document surface, restrained green accents, thin horizontal
rules, distinct floor/space/group hierarchy, wrapped and padded descriptions, and a
portrait summary with landscape detail sheets. Standard rows have the same background
before and after a composite. Parent and child rows use related, different green tints.
Existing columns, serial numbers, values, formulas, ordering and no-freeze-pane behavior
are preserved. Long summaries may flow to another page rather than shrinking to fit.

UI changes include consistent sans-serif controls, viewport-aware project menus,
keyboard-accessible dialogs, responsive Builder panel state, rate-card search and readable
units, multiline template descriptions, decimal rate entry, revision-restore confirmation,
editable quotation notes, and clearer quotation-preview hierarchy and discount disclosure.

## Reproducible checks

```sh
npx tsc --noEmit
npm run test:pricing
npm run test:composites
npm run test:firebase-security
npm run test:excel-export
npm run build
npm run build:ios
```

The Excel test writes the multi-sheet fixture and a separate composite fixture to its
reported output directory. Both were rendered using LibreOffice; all five worksheets,
all seven multi-sheet print pages, and composite parent/child numbering were inspected.
The fixture grand total remains 841074.703125 (displayed as 841,074.70).

For safe UI inspection without touching office data:

```sh
node scripts/preview-ui.mjs
```

Open `http://127.0.0.1:4174/#/projects/review` for the admin view, or
`http://127.0.0.1:4174/?employee#/projects/review` for the employee view.
This serves the real UI with an isolated in-memory store, no Firebase configuration,
and disposable sample data. It is not part of the production build. Refresh resets it.

Inspected flows: project register and creation wizard, Builder, floor/space management,
project menu, rate card/search/edit, project Rates, fee structure, firm settings,
comparison, quotation preview, revision-save dialog, and composite creation/component
selection. Menu bounds were checked at 320, 375, 390 and 430 pixels, 844×390 landscape,
and desktop. Modal Escape and outside-click dismissal were exercised. Employee project
actions retain technical options without financial actions.

## Limits

No local Firebase environment credentials were available. This is not a live-account,
cross-device or Firebase-emulator end-to-end test. The security test above verifies
existing split/merge and rule regressions; production rules were not changed/deployed.
Native iOS compilation and Excel Online/desktop Excel rendering were not exercised.
The static web build validates the Capacitor web assets, not Xcode signing.
The PDF preview layout was visually checked; a native browser print dialog was not run.
Repository-wide lint has existing warnings/errors and is not claimed to pass.
