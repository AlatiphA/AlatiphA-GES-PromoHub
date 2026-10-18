/* About, release checks and explicit app installation. */
(function () {
  'use strict';
  const version = document.getElementById('aboutAppVersion');
  if (version) version.textContent = APP_VERSION;
  const button = document.getElementById('aboutCheckUpdates');
  const status = document.getElementById('aboutUpdateStatus');
  const install = document.getElementById('aboutInstallApp');
  install?.addEventListener('click', async () => {
    if (typeof window.promoHubInstall === 'function') await window.promoHubInstall();
    else document.getElementById('aboutInstallStatus').textContent = 'Open your browser menu and choose Install app or Add to Home screen.';
  });
  function waitForInstall(worker) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Update download timed out')), 30000);
      function finish(error) {
        clearTimeout(timer);
        worker.removeEventListener('statechange', change);
        if (error) reject(error); else resolve();
      }
      function change() {
        if (worker.state === 'installed' || worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Update installation failed'));
      }
      worker.addEventListener('statechange', change);
      change();
    });
  }
  button?.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Checking for updates…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (navigator.onLine === false) throw new Error('Offline');
      const response = await fetch('./version.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Release check failed');
      const release = await response.json();
      if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid release');
      let registration = null;
      if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.getRegistration('./');
        if (!registration) registration = await navigator.serviceWorker.register('./sw.js');
        await registration.update();
        if (registration.installing) await waitForInstall(registration.installing);
      }
      const newer = release.version.split('.').map(Number);
      const current = APP_VERSION.split('.').map(Number);
      const firstDifference = newer.findIndex((part, i) => part !== current[i]);
      const available = firstDifference >= 0 && newer[firstDifference] > current[firstDifference];
      if (registration?.waiting) {
        status.textContent = 'An update is ready. Close all PromoHub tabs and app windows, then reopen PromoHub to finish updating.';
      } else if (available) {
        status.textContent = 'Version ' + release.version + ' is available. Close all PromoHub tabs and app windows, then reopen PromoHub to load it.';
      } else {
        status.textContent = 'You’re up to date. Version ' + APP_VERSION + '.';
      }
    } catch (error) {
      status.textContent = navigator.onLine === false
        ? 'Connect to the internet to check for updates.'
        : 'Could not check for updates. Check your connection and try again.';
      console.error('PromoHub update check:', error);
    } finally {
      clearTimeout(timer);
      button.disabled = false;
    }
  });
})();
