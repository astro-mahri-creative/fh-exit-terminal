import { useCallback } from 'react';
import { isKiosk } from '../kiosk';

// The keyboard animates in after focus lands, so the browser's own
// scroll-into-view runs against the pre-keyboard viewport and routinely leaves
// the field sitting under the keys. Wait for the animation to finish before
// measuring.
const KEYBOARD_SETTLE_MS = 350;

/**
 * Returns an onFocus handler that centers the focused field in whatever screen
 * space the native keyboard leaves behind.
 *
 * No-op on the kiosk: its fields carry inputMode="none", so no keyboard ever
 * appears and scrolling the page on focus would just yank it out from under the
 * visitor.
 */
export default function useScrollIntoViewOnFocus() {
  return useCallback((event) => {
    if (isKiosk()) return;

    const el = event.currentTarget;

    setTimeout(() => {
      if (!el.isConnected) return;

      const viewport = window.visualViewport;
      const rect = el.getBoundingClientRect();

      // Without visualViewport we cannot tell where the keyboard ends, so fall
      // back to the browser's best guess.
      if (!viewport) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // The region still visible above the keyboard, in layout-viewport
      // coordinates — which is the space the field actually has to live in.
      const visibleTop = viewport.offsetTop;
      const desiredTop = visibleTop + Math.max(0, (viewport.height - rect.height) / 2);

      window.scrollBy({ top: rect.top - desiredTop, behavior: 'smooth' });
    }, KEYBOARD_SETTLE_MS);
  }, []);
}
