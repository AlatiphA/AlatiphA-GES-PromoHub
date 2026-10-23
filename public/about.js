/* About, release checks and explicit app installation. */
(function () {
  'use strict';
  const version = document.getElementById('aboutAppVersion');
  if (version) version.textContent = APP_VERSION;
  const button = document.getElementById('aboutCheckUpdates');
  const status = document.getElementById('aboutUpdateStatus');
  const update = document.getElementById('aboutInstallUpdate');
  const install = document.getElementById('aboutInstallApp');
  let pendingRegistration = null;
  let updateAvailable = false;
  let updating = false;
  let reloaded = false;

  install?.addEventListener('click', async () => {
    if (typeof window.promoHubInstall === 'function') await window.promoHubInstall();
    else document.getElementById('aboutInstallStatus').textContent = 'Open your browser menu and choose Install app or Add to Home screen.';
  });

  function withTimeout(work, milliseconds, message) {
    let timer;
    return Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }

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

  function activateUpdate(worker) {
    return new Promise((resolve, reject) => {
      const serviceWorker = navigator.serviceWorker;
      const timer = setTimeout(() => finish(new Error('Update activation timed out')), 30000);
      function finish(error) {
        clearTimeout(timer);
        serviceWorker.removeEventListener('controllerchange', changed);
        if (error) reject(error); else resolve();
      }
      function changed() {
        if (serviceWorker.controller === worker) finish();
      }
      serviceWorker.addEventListener('controllerchange', changed);
      if (serviceWorker.controller === worker) { finish(); return; }
      try { worker.postMessage({ type: 'PROMOHUB_ACTIVATE_UPDATE' }); }
      catch (error) { finish(error); }
    });
  }

  update?.addEventListener('click', async () => {
    if (updating || reloaded || !updateAvailable) return;
    updating = true;
    update.disabled = true;
    if (button) button.disabled = true;
    status.textContent = 'Installing update…';
    try {
      if (typeof persistCurrentReaderPosition === 'function') persistCurrentReaderPosition();
      if (pendingRegistration?.installing) await waitForInstall(pendingRegistration.installing);
      const waiting = pendingRegistration?.waiting;
      if (waiting) await activateUpdate(waiting);
      // Complete the existing local and server handover before the new page claims a session.
      if (typeof readerSessionRelease === 'function') {
        await withTimeout(readerSessionRelease(), 15000, 'Reading session is still closing');
      }
      if (typeof persistCurrentReaderPosition === 'function') persistCurrentReaderPosition();
      if (!reloaded) {
        reloaded = true;
        status.textContent = 'Update installed. Refreshing…';
        window.location.reload();
      }
    } catch (error) {
      status.textContent = 'Could not finish the update. Please try Install update again.';
      console.error('PromoHub update installation:', error);
      updating = false;
      update.disabled = false;
      if (button) button.disabled = false;
    }
  });

  button?.addEventListener('click', async () => {
    if (button.disabled || updating) return;
    button.disabled = true;
    if (update) update.hidden = true;
    updateAvailable = false;
    pendingRegistration = null;
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
        await withTimeout(registration.update(), 30000, 'Update check timed out');
        if (registration.installing) await waitForInstall(registration.installing);
      }
      const newer = release.version.split('.').map(Number);
      const current = APP_VERSION.split('.').map(Number);
      const firstDifference = newer.findIndex((part, i) => part !== current[i]);
      const available = firstDifference >= 0 && newer[firstDifference] > current[firstDifference];
      pendingRegistration = registration;
      updateAvailable = !!registration?.waiting || available;
      if (update) update.hidden = !updateAvailable;
      if (updateAvailable) {
        status.textContent = 'An update is ready. Select Install update to update and refresh PromoHub.';
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
