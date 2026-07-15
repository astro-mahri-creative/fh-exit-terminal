// Kiosk mode — is this the physical exhibit terminal?
//
// Deliberately NOT inferred from the device. The exhibit kiosk is a
// touchscreen, so every capability signal that supposedly identifies a phone
// (pointer: coarse, maxTouchPoints, touch events) is true of the kiosk too.
// There is no reliable way to tell them apart, so kiosk mode is opt-in and
// mobile is the default: an unrecognized device can never end up stranded with
// an on-screen keyboard it cannot use.
//
// Arm the exhibit machine once by loading the app at `/?kiosk=1`; the flag is
// persisted, so it survives refreshes and reboots. `/?kiosk=0` disarms it.
const STORAGE_KEY = 'fh_kiosk_mode';

function resolveKioskMode() {
  let param = null;
  try {
    param = new URLSearchParams(window.location.search).get('kiosk');
  } catch {
    /* no-op */
  }

  if (param !== null) {
    const on = param === '1' || param === 'true';
    try {
      if (on) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode / storage disabled: honor the URL for this load only.
    }
    return on;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// Resolved once at module load. Mode cannot change mid-session, and pinning it
// keeps every consumer consistent.
const KIOSK = resolveKioskMode();

export const isKiosk = () => KIOSK;

export default isKiosk;
