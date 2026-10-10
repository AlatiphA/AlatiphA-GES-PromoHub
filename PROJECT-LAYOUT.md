# PromoHub: one repository, one deployment source

Use C:\AlatiphA\PromoHub-GitHub for all future edits, tests, Firebase deployments and GitHub pushes. Website files are in public/. Functions, tests, rules and Firebase configuration remain at the repository root.

The old C:\AlatiphA\PromoHub folder has been renamed to PromoHub-Legacy-<timestamp>. It is an archive, not a deployment source. A baseline-correction-backup-clean-layout-<timestamp> folder in the repository stores the previous configuration, README and tests. Keep both backups until verification is complete.

The migration preserves website bytes and public URLs, including the service worker, books and guide. App v1.7.4 and cache v1.6.4 remain unchanged. Git history and .git are preserved. Functions, rules, accounts, subscriptions and stored reading data do not change.

## Test from the single repository

```powershell
$ErrorActionPreference = 'Stop'
$node22Folder = 'C:\Users\Zoozug T.I AH Prm-KG\AppData\Local\nvm\v22.20.0'
$env:Path = "$node22Folder;$env:Path"
cd C:\AlatiphA\PromoHub-GitHub\functions
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Stop here.' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Stop here.' }
cd ..
```

Development verification: all 97 tests passed in the new layout. Three layout tests check Hosting isolation, precache paths, HTML references and manifest icons. Website asset hashes before and after the local move match. The Windows migration script cannot be executed in this Linux environment. No Functions or rules tests need repeating solely for this file relocation.

## Deploy Hosting from this same repository

```powershell
npx.cmd --yes firebase-tools@15.33.0 deploy --only hosting --project ges-promohub
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Stop here.' }
```

Do not deploy Functions or rules for this migration. Firebase Hosting publishes the contents of public at the domain root, so do not add /public to website URLs. Verify the library, a book, saved position, sign-in, account panel and https://ges-promohub.web.app/user-guide.html on the live app.

## Commit and push the structure change

```powershell
cd C:\AlatiphA\PromoHub-GitHub
git status --short
git add -A
if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed. Stop here.' }
git diff --cached --stat
git commit -m "Consolidate PromoHub into one repository with public Hosting folder"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }
git status -sb
```

Git should recognise website files as renames into public/. Do not commit migration backups or the archived deployment folder. Existing ignore rules exclude backups and dependencies.

Future patches must target this layout. Do not run old installers that expect app.js at the repository root or both original folders.
