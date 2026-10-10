# Independent PromoHub sites from one source folder

Both addresses run the complete app without redirecting:
- https://ges-promohub.web.app/
- https://alatipha.github.io/AlatiphA-GES-PromoHub/

Website source remains in public/. Firebase Hosting deploys that folder. The workflow .github/workflows/promohub-pages.yml tests the repository, uploads only public, then deploys GitHub Pages. It runs on main pushes and can be started manually. No second website source copy is needed.

## Required one-time settings

In https://github.com/AlatiphA/AlatiphA-GES-PromoHub/settings/pages, select GitHub Actions under Build and deployment > Source. Do this before pushing the workflow. The former Deploy from a branch setting serves the wrong folder.

In the Firebase project ges-promohub, open Authentication > Settings > Authorized domains. Ensure alatipha.github.io is present. Add the hostname if missing, without https or the repository path. Retain the existing Firebase domains. Google sign-in and email-action return links require allowed domains.

Both sites use the same Firebase project, accounts, subscriptions and cloud reader data. Local storage, installed apps, login sessions and caches belong to their respective origins. Guest/trial-only reading data does not automatically transfer between origins. Nothing in this update clears either site's storage.

Email-change verification links return to the current app index.html, preserving the GitHub repository path. App v1.7.5; SW cache v1.6.5. Both sites need the same release: deploy Firebase Hosting and push to GitHub. Functions, security rules and database records do not change.

## Verify

After the Publish PromoHub to GitHub Pages workflow succeeds, open both addresses. Each should stay on its own address and show the library/login, not a repository README or redirect. Test sign-in, the same account subscription status, a book, footnotes, refresh restoration, FAQ and the user guide. Close existing app windows and reopen if the previous worker is still active. Do not clear data as part of deployment.

The workflow packages public at the website root, so GitHub URLs do not include /public/. Do not move app files back to the repository root. The obsolete root redirect index.html is removed.
