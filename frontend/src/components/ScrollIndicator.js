import React, { useState, useEffect } from 'react';
import './ScrollIndicator.css';

// Purely decorative affordance — pinned to the bottom-right of the viewport,
// visible only while there is more page below the fold. Not a button: it is
// pointer-events:none so it can never swallow a tap meant for the UI beneath it.
const BOTTOM_SLACK_PX = 24;

function ScrollIndicator() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Measured synchronously rather than deferred through requestAnimationFrame:
    // rAF is paused while the tab is in the background, which would leave the
    // indicator showing a stale answer the moment the page came back. React
    // bails out of the re-render when the value is unchanged, so calling this
    // on every scroll tick is cheap.
    const measure = () => {
      const doc = document.documentElement;
      const remaining = doc.scrollHeight - window.innerHeight - window.scrollY;
      setVisible(remaining > BOTTOM_SLACK_PX);
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    // The page grows and shrinks from DOM changes far more than from viewport
    // changes: the admin panel expanding, codes piling up, the save-progress
    // block appearing, whole screens swapping out. ResizeObserver would be the
    // obvious tool, but it does not reliably report the document-level boxes
    // here, so watch the mutations that cause the reflow instead.
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });

    // The first measurement lands before the web fonts swap in, while text is
    // still in the fallback face and the page is momentarily taller than it
    // ends up. Without these the indicator latches on and never clears.
    let cancelled = false;
    const settle = () => { if (!cancelled) measure(); };
    document.fonts?.ready.then(settle);
    const settleTimer = setTimeout(settle, 250);

    return () => {
      cancelled = true;
      clearTimeout(settleTimer);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      mutations.disconnect();
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="scroll-indicator" aria-hidden="true">
      <span className="scroll-indicator-chevrons">
        <span className="scroll-chevron" />
        <span className="scroll-chevron" />
        <span className="scroll-chevron" />
      </span>
    </div>
  );
}

export default ScrollIndicator;
