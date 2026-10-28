// src/core/state.js
// Shared mutable UI state (single instance imported by the UI modules).

// ==================== PWA === START =============================

// PWA installation and user-controlled app updates.
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// Keep this value synchronized with version.json and sw.js.
const PEDICALC_APP_VERSION = '1.0.1';
const PEDICALC_CACHE_PREFIX = 'pedicalc-pwa-';
let pedicalcPwaRegistration = null;
let pedicalcUpdateCheckRunning = false;

async function fetchLatestpedicalcVersion() {
    try {
        const versionUrl = new URL('./version.json', document.baseURI);
        versionUrl.searchParams.set('_', Date.now().toString());
        const response = await fetch(versionUrl.toString(), { cache: 'no-store' });
        if (!response.ok) return null;

        const info = await response.json();
        if (typeof info.version !== 'string' || typeof info.cacheName !== 'string') {
            return null;
        }
        return info;
    } catch {
        // No internet? Do not interrupt the user or stop the cached app from running.
        return null;
    }
}

async function isCompletepedicalcCache(cacheName, version) {
    try {
        if (!(await caches.has(cacheName))) return false;
        const cache = await caches.open(cacheName);
        const markerUrl = new URL('__pedicalc_cache_ready__', document.baseURI).href;
        const marker = await cache.match(markerUrl);
        if (!marker) return false;
        const details = await marker.json();
        return details.version === version;
    } catch {
        return false;
    }
}

async function waitForpedicalcCache(registration, cacheName, version) {
    // Ask the browser to check whether sw.js has changed. A new sw.js must use a new
    // CACHE_NAME; that installation downloads the candidate version into its own cache.
    try {
        await registration.update();
    } catch {
        // The test below will fail safely if the candidate cache is not available.
    }

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const worker = registration.installing || registration.waiting;
        if (worker && worker.state === 'redundant') return false;

        const complete = await isCompletepedicalcCache(cacheName, version);
        if (complete && (!worker || worker.state === 'installed' || worker.state === 'activated')) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
}

function tellServiceWorkerToUseVersion(cacheName, version) {
    return new Promise(resolve => {
        const controller = navigator.serviceWorker.controller;
        if (!controller || typeof MessageChannel === 'undefined') {
            resolve({ ok: false });
            return;
        }

        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
            channel.port1.close();
            resolve({ ok: false });
        }, 5000);

        channel.port1.onmessage = event => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(event.data || { ok: false });
        };

        controller.postMessage({
            type: 'PEDICALC_SET_ACTIVE_CACHE',
            cacheName,
            version
        }, [channel.port2]);
    });
}

async function checkForpedicalcUpdate() {
    if (pedicalcUpdateCheckRunning || !navigator.serviceWorker || !navigator.onLine) return;
    pedicalcUpdateCheckRunning = true;

    try {
        const latest = await fetchLatestpedicalcVersion();
        if (!latest) return;

        // Reject unexpected cache names; these should be written only by the project owner.
        if (!latest.cacheName.startsWith(PEDICALC_CACHE_PREFIX)) return;

        let installedVersion = localStorage.getItem('pedicalcAppVersion');
        if (!installedVersion) {
            installedVersion = PEDICALC_APP_VERSION;
            localStorage.setItem('pedicalcAppVersion', installedVersion);
        }

        if (latest.version === installedVersion) return;
        // Remember a declined version so the same prompt does not appear on every launch.
        if (sessionStorage.getItem('pedicalcDeclinedVersion') === latest.version) return;

        const accepted = window.confirm(
            `نسخه جدید PediCalc (${latest.version}) موجود است.\n\n` +
            'آیا می‌خواهید نسخه جدید دانلود و فعال شود؟\n' +
            'اگر «لغو» را انتخاب کنید، نسخه فعلی حفظ می‌شود و برنامه آفلاین هم کار خواهد کرد.'
        );

        if (!accepted) {
            sessionStorage.setItem('pedicalcDeclinedVersion', latest.version);
            return;
        }

        const registration = pedicalcPwaRegistration ||
            await navigator.serviceWorker.getRegistration('./');
        if (!registration) {
            alert('ثبت PWA پیدا نشد. نسخه فعلی همچنان فعال می‌ماند.');
            return;
        }

        const ready = await waitForpedicalcCache(registration, latest.cacheName, latest.version);
        if (!ready) {
            alert('نسخه جدید کامل دانلود نشد. نسخه فعلی حفظ شده است. لطفاً بعداً دوباره امتحان کنید.');
            return;
        }

        const result = await tellServiceWorkerToUseVersion(latest.cacheName, latest.version);
        if (!result || !result.ok) {
            alert('تغییر نسخه انجام نشد؛ نسخه فعلی حفظ شده است. لطفاً برنامه را یک بار ببندید و دوباره باز کنید.');
            return;
        }

        localStorage.setItem('pedicalcAppVersion', latest.version);
        sessionStorage.removeItem('pedicalcDeclinedVersion');
        window.location.reload();
    } catch (error) {
        // Update-check errors must never prevent normal or offline app use.
        console.warn('pedicalc update check failed:', error);
    } finally {
        pedicalcUpdateCheckRunning = false;
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            pedicalcPwaRegistration = await navigator.serviceWorker.register('./sw.js');

            // Ask the browser to preserve this site's stored data when possible.
            if (navigator.storage && typeof navigator.storage.persist === 'function') {
                navigator.storage.persist().then(granted => {
                    console.info('Persistent storage granted:', granted);
                }).catch(() => {});
            }

            // Delay slightly so the first page can finish initializing; this is non-blocking.
            setTimeout(() => checkForpedicalcUpdate(), 1500);
        } catch (error) {
            console.warn('Service Worker registration failed:', error);
        }
    });

    window.addEventListener('online', () => checkForpedicalcUpdate());
}



// ==================== PWA === END ===============================

export const State = {
    category: 'all',
    searchQuery: '',
    openDropdownId: null,
    prescriptionList: []
};

/** Whether the user has an active premium entitlement (from the Android bridge). */
export function isPremiumUser() {
    if (typeof window !== 'undefined' && typeof window.Android !== 'undefined' && window.Android.isPremium) {
        try {
            return !!window.Android.isPremium();
        } catch {
            return false;
        }
    }
    return true;
}
