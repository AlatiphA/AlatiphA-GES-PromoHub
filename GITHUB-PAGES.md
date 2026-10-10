# GitHub Pages compatibility address

The application is hosted at https://ges-promohub.web.app/. Website files remain in public/ and Firebase Hosting serves that folder.

The repository-root index.html is a small compatibility page for https://alatipha.github.io/AlatiphA-GES-PromoHub/. It redirects to Firebase using JavaScript and HTML refresh, with an accessible Open PromoHub link if automatic navigation fails. It contains no duplicate application code or backend SDK.

For the existing GitHub Pages branch publication, keep source main and folder /(root). Do not change Firebase Hosting's public folder back to the repository root.

GitHub Pages and Firebase have separate browser storage. This compatibility page does not clear or copy data. Paid cloud progress can restore when using the same verified active account. Guest or trial-only local progress from the old GitHub address does not automatically transfer to Firebase. Keep the old site's browser data if you need to recover it.

The fix requires a GitHub commit and push, followed by completion of the Pages deployment. No Firebase deployment is needed. App v1.7.4 and service-worker cache v1.6.4 remain unchanged. An installed app with an old GitHub scope may open Firebase in a browser; reinstall from the Firebase address after confirming it works. Do not clear local storage as part of this fix.
