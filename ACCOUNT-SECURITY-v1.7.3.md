# Account Security v1.7.3

My Account now has an expandable Account Security section matching SchoolHub's login-credential controls. Email/password users can change their password after confirming their current password, or request a verified login-email change. Google-only users are directed to Google Account Security. Refresh verified email synchronises the verified Firebase Auth address to the existing PromoHub profile.

Password fields are cleared after operations, when closing the section or account panel, and on account changes. Credentials are never sent to callable Functions, Firestore, local storage or offline queues. Account switching invalidates the operation's UI result and is checked before the next credential mutation. Actions are online-only. Duplicate submissions are blocked while an operation is running.

The server checks recent authentication before preparing email changes, verified tokens against the current Firebase Auth email, disabled status, deletion markers and the active PromoHub profile. Firebase Auth enforces login email uniqueness. Pending email metadata does not change the login address. The final address comes from verified Firebase Auth, never browser data. Requests and completed email changes produce server-written audit records without passwords. The UID is unchanged, preserving reading data, subscriptions and administrator claims.

PromoHub has no SchoolHub staff/contact-email model or school membership email reservations. This patch uses Firebase Auth account uniqueness and verification rather than adding school-specific reservations. It does not add MFA or a session/device manager.

No dependencies or security rules are changed. The existing rules already deny client changes to login email, pending login email and verification metadata. The new emulator test checks these protections.

Deployment: initializePromoHubAccount, preparePromoHubLoginEmail, synchronizePromoHubLoginEmail and Hosting. Never deploy the UI before the Functions complete successfully. Auth verification templates must use an authorised app domain, currently ges-promohub.web.app, for the return link.
