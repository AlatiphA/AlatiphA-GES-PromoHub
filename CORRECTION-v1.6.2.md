# Current-source correction v1.6.2

This corrects the earlier use of an obsolete source archive. Baseline: the second uploaded AlatiphA-GES-PromoHub-main(1).zip, app v1.6.0 / SW v1.5.6, archive commit 937231ac0f5a8d3d0e963638e5b0ef7bede6f779.

App is now v1.6.2 and SW cache v1.5.8. Existing login/registration screen, profile/avatar buttons and account card are retained. Security controls are integrated into that card. There is no second floating Account interface.

Verified email is required for cloud operations. Initialization and protected status/tier operations use the previously deployed callable Functions. Premium approval, account administration, profile-name editing, password reset, recent-auth account deletion and audit views are included. Existing GES PromoHub Firebase configuration is retained.

Rules support the source's users/{uid}/reading/{bookId}, bookmarks and preferences/reader paths as well as the earlier correction's readerData and preferences/default paths. Existing documents are not deleted. Newly signed-in accounts can copy device-local data, with a choice, to account-specific local storage. Legacy keys remain retained. The anonymous shared-location migration is limited to the known last book. Guest/offline reader functionality is retained. Account changes close the active rendition before changing the local scope. Deletion removes cloud records through the server and leaves local copies; do not use an administrator account for deletion tests.

Native v1.6.0 reader, in-app FAQ, pull-refresh and pinch handlers are preserved. They were compared directly with the uploaded source. All six EPUB hashes match the source. New UI and cross-device behavior still require browser/device smoke testing; no rendered UI or real-auth verification was performed here. The existing browser Firebase SDK is retained from the source. The zero-production npm audit pertains to the server package, not every browser/CDN dependency.

Validation: 21 Node unit/source-preservation checks passed; 13 Firestore emulator tests passed, including native reading, preference and bookmark schemas, and suspended-user denial. Backend module loads with pinned Admin 14.5.0 / Functions 7.4.0. JavaScript syntax checks pass.

## Apply locally on Windows

Extract the ZIP into a separate correction directory. Run Apply-Corrected-PromoHub.ps1 from that directory, specifying your existing project folder. It backs up every replaced file in baseline-correction-backup-<timestamp> before copying corrected source. It retires the three old unit-test files tied to the incorrect baseline after backing them up. It does not deploy or modify Firebase cloud records.

Keep your Node 22 PowerShell PATH workaround active:

```powershell
$node22Folder = 'C:\Users\Zoozug T.I AH Prm-KG\AppData\Local\nvm\v22.20.0'
$env:Path = "$node22Folder;$env:Path"
powershell -NoProfile -ExecutionPolicy Bypass -File C:\AlatiphA\PromoHub-Correction\Apply-Corrected-PromoHub.ps1 -ProjectPath C:\AlatiphA\PromoHub
cd C:\AlatiphA\PromoHub\functions
npm.cmd ci
npm.cmd test
npm.cmd audit --omit=dev
cd ..
npx.cmd --yes firebase-tools@15.33.0 emulators:exec --project demo-promohub --only firestore "node --test tests/rules.emulator.cjs"
```

Only after local checks pass:

```powershell
npx.cmd --yes firebase-tools@15.33.0 deploy --only functions,firestore:rules,hosting --project ges-promohub
```

Functions already exist. The CLI updates them; this does not require a new Firebase project or another billing account. Included hosting exclusions protect backups, scripts, tests, dependencies and logs.

After release, close all PromoHub tabs and the installed PWA. Reopen https://ges-promohub.web.app in a fresh browser tab and verify v1.6.2. The worker activates after previous clients close. Test registration, verification, login, both profile buttons, account controls, all books and gestures. Set up your first administrator separately using the owner bootstrap process. Never upload or paste service-account keys or private credentials.
