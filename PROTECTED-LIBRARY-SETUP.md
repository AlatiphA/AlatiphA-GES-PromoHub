# PromoHub protected books

PromoHub 1.11.27 moves five paid EPUBs out of the public website files. Firestore serves their contents in small chunks only to a verified, active account with a current paid subscription, legacy Premium access, complimentary reading access, or the PromoHub administrator claim.

Model Aptitude Test for GES 1 (`mat1.epub`) remains the one public guest book for continuity with PromoHub's current guest flow. The app still enforces the three-day guest trial, but a public file URL can bypass that timer. Enforcing the expiry at the file level would require protecting this book too and changing guest trials to use server-backed anonymous sessions.

## One-time migration

Production migration completed on 14 November 2026. All five EPUBs were read back from Firestore and their byte counts and SHA-256 hashes matched the local source files before the protected manifest was published. The administration uploader remains available for future replacements.

The five original EPUBs are kept locally in the ignored `protected-library-source` folder. That folder is excluded from Git and website deployment. Do not add those source files back to `public/library` or commit them.

After deploying release 1.11.27 and the included Firestore rules:

1. Sign in to PromoHub as an administrator and open `admin.html` → **Protected books**.
2. Select all five `.epub` files from `protected-library-source`.
3. Select **Upload and protect books**. The current manifest is published only after all five files upload successfully.
4. Confirm the admin page says **Protected library is ready**. A verified eligible account can then read and download the paid books; new offline downloads continue to use PromoHub's existing download manager.

The old EPUB copies were previously public in the GitHub repository. Removing the current files closes the normal website URLs, but it does not erase copies already downloaded or the earlier public Git commits. Fully removing the books from repository history requires a coordinated history rewrite and cannot recall copies already made.
