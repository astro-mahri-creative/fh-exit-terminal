const { Universe, Phase, FinalStateEvent } = require('../models');

// The two statuses a universe cannot be pulled back out of by ordinary play:
// TRANSCENDED (0 cases) and QUARANTINED (at or above its initialization
// count). Both clear canSpread, and standard target selection never lands on
// them (see standardTargetPool in server.js), so once every universe holds
// one of these the board can no longer move. That is "final state".
//
// PRESERVED and LIBERATED are deliberately NOT terminal — the CURE and RVLT
// break codes exist precisely to knock universes out of them, and once no
// COMPROMISED universe is left, standard codes erode them too.
const TERMINAL_STATUSES = ['TRANSCENDED', 'QUARANTINED'];

const WEBHOOK_TIMEOUT_MS = 8000;

/**
 * True when every universe is locked in a permanent status.
 * An empty list is never final — an unseeded database is not an ending.
 */
function isFinalState(universes = []) {
  return universes.length > 0 && universes.every(u => TERMINAL_STATUSES.includes(u.status));
}

// Phase numbering here follows the Phase collection, which the admin
// "Reset Dimension Statistics" action increments. Falls back to 1 so a
// database that predates phase tracking still gets exactly one alert.
async function getCurrentPhaseNumber() {
  const active = await Phase.findOne({ isActive: true }).sort({ phaseNumber: -1 });
  if (active) return active.phaseNumber;
  const last = await Phase.findOne().sort({ phaseNumber: -1 });
  return last ? last.phaseNumber : 1;
}

function snapshotOf(universes) {
  return universes.map(u => ({
    name: u.name,
    status: u.status,
    currentCases: u.currentCases,
    initializationCases: u.initializationCases,
  }));
}

function summarize(snapshot) {
  const counts = snapshot.reduce((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1;
    return acc;
  }, {});
  const totalCases = snapshot.reduce((sum, u) => sum + (u.currentCases || 0), 0);
  return { counts, totalCases };
}

function buildAlertText(event) {
  const { counts, totalCases } = summarize(event.snapshot);
  const lines = event.snapshot
    .map(u => `  ${u.name.padEnd(10)} ${String(u.status).padEnd(13)} ${Number(u.currentCases).toLocaleString()} / ${Number(u.initializationCases).toLocaleString()}`)
    .join('\n');

  return `${event.isTest ? 'TEST ALERT — ' : ''}FINAL STATE REACHED — PHAX DIMENSIONAL NETWORK

Every universe is now locked in a permanent status. No further code
transmission can move the network until dimension statistics are reset.

Phase:        ${event.phaseNumber}
Detected:     ${new Date(event.detectedAt).toISOString()}
Triggered by: user ${event.userId || 'unknown'}
Breakdown:    ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}
Total cases:  ${totalCases.toLocaleString()}

${lines}
`;
}

function buildAlertHtml(event) {
  const { counts, totalCases } = summarize(event.snapshot);
  const rows = event.snapshot.map(u => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:'Courier New',monospace;color:#f0eeeb;">${u.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:'Courier New',monospace;color:${u.status === 'TRANSCENDED' ? '#9575cd' : '#c94040'};">${u.status}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:'Courier New',monospace;color:#f0eeeb;text-align:right;">${Number(u.currentCases).toLocaleString()} / ${Number(u.initializationCases).toLocaleString()}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#060606;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;font-family:'Courier New',monospace;color:#f0eeeb;">
  <tr><td style="padding-bottom:16px;border-bottom:1px solid #2a2a2a;">
    <h1 style="margin:0;font-size:15px;letter-spacing:0.25em;color:#c94040;">${event.isTest ? 'TEST ALERT &mdash; ' : ''}FINAL STATE REACHED</h1>
    <p style="margin:6px 0 0;font-size:11px;color:#777;letter-spacing:0.14em;">FUTURE HOOMAN EXIT TERMINAL — PHASE ${event.phaseNumber}</p>
  </td></tr>
  <tr><td style="padding:18px 0;font-size:13px;line-height:1.7;color:#f0eeeb;">
    Every universe is locked in a permanent status. No further code transmission
    can move the network until dimension statistics are reset from the admin panel.
  </td></tr>
  <tr><td style="padding-bottom:12px;font-size:12px;color:#aac4ff;">
    ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' &middot; ')} &middot; ${totalCases.toLocaleString()} total cases<br>
    Detected ${new Date(event.detectedAt).toISOString()} &middot; triggered by user ${event.userId || 'unknown'}
  </td></tr>
  <tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#0f0f0f;border:1px solid #2a2a2a;">${rows}</table></td></tr>
</table>
</body></html>`;
}

// ── Channels ──────────────────────────────────────────────────────────────
// Each returns { channel, ok, detail }. A channel that isn't configured is
// skipped silently (no row) rather than recorded as a failure — an operator
// who never set a webhook URL doesn't have a broken webhook.

async function dispatchWebhook(event) {
  const url = process.env.FINAL_STATE_WEBHOOK_URL;
  if (!url) return null;

  const body = {
    event: event.isTest ? 'final_state_test' : 'final_state_reached',
    phaseNumber: event.phaseNumber,
    detectedAt: event.detectedAt,
    userId: event.userId || null,
    summary: summarize(event.snapshot),
    universes: event.snapshot,
    text: buildAlertText(event),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    return {
      channel: 'webhook',
      ok: res.ok,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return { channel: 'webhook', ok: false, detail: err.message };
  }
}

async function dispatchEmail(event, sendMail) {
  const to = (process.env.FINAL_STATE_ALERT_EMAIL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (to.length === 0) return null;
  if (typeof sendMail !== 'function') {
    return { channel: 'email', ok: false, detail: 'no mail transport configured' };
  }

  try {
    await sendMail({
      to: to.join(', '),
      subject: `[Exit Terminal] ${event.isTest ? 'TEST — ' : ''}FINAL STATE REACHED — phase ${event.phaseNumber}`,
      text: buildAlertText(event),
      html: buildAlertHtml(event),
    });
    return { channel: 'email', ok: true, detail: `sent to ${to.length} recipient(s)` };
  } catch (err) {
    return { channel: 'email', ok: false, detail: err.message };
  }
}

/**
 * Detect final state and, the first time it happens in a phase, record it and
 * fan the alert out to every configured channel.
 *
 * Safe to call on every finalize: the phase-unique FinalStateEvent row is the
 * idempotency key, so repeat calls after the board has already locked return
 * `{ isFinal: true, alerted: false }` without notifying anyone again.
 *
 * Never throws — an alerting failure must not take down a player's
 * transmission. Failures are logged and recorded on the event row.
 *
 * @param {Object}   opts
 * @param {Array}    opts.universes  Universe docs AFTER this round's updates.
 * @param {Object}   [opts.session]  Session that triggered the final state.
 * @param {Function} [opts.sendMail] ({to, subject, text, html}) => Promise
 * @param {Function} [opts.logEvent] analytics logger, same signature as server's
 */
async function checkFinalState({ universes, session = null, sendMail = null, logEvent = null } = {}) {
  try {
    if (!isFinalState(universes)) return { isFinal: false, alerted: false };

    const phaseNumber = await getCurrentPhaseNumber();

    // Claim the phase. The unique index means exactly one concurrent caller
    // wins; everyone else takes the duplicate-key path and dispatches nothing.
    let event;
    try {
      event = await FinalStateEvent.create({
        phaseNumber,
        detectedAt: new Date(),
        sessionId: session?._id || null,
        userId: session?.userId || null,
        snapshot: snapshotOf(universes),
      });
    } catch (err) {
      if (err.code === 11000) return { isFinal: true, alerted: false, phaseNumber };
      throw err;
    }

    console.warn(`[FINAL STATE] Phase ${phaseNumber}: every universe is locked. Dispatching alerts.`);
    console.warn(buildAlertText(event));

    const results = (await Promise.all([
      dispatchWebhook(event),
      dispatchEmail(event, sendMail),
    ])).filter(Boolean);

    event.notifications = results;
    event.dispatched = true;
    await event.save();

    if (typeof logEvent === 'function') {
      await logEvent('final_state_reached', session?._id || null, session?.userId || null, {
        phaseNumber,
        summary: summarize(event.snapshot),
        channels: results.map(r => ({ channel: r.channel, ok: r.ok })),
      });
    }

    return { isFinal: true, alerted: true, phaseNumber, notifications: results };
  } catch (error) {
    // Alerting is strictly a side channel. Swallow, shout in the logs, and let
    // the transmission that triggered it finish normally.
    console.error('Final-state alert dispatch failed:', error);
    return { isFinal: true, alerted: false, error: error.message };
  }
}

/**
 * Read-only view for the admin panel: is the board final right now, and what
 * was recorded the last time it locked?
 */
async function getFinalStateStatus() {
  const universes = await Universe.find().sort({ displayOrder: 1 });
  const phaseNumber = await getCurrentPhaseNumber();
  const lastEvent = await FinalStateEvent.findOne().sort({ detectedAt: -1 }).lean();

  const lockedCount = universes.filter(u => TERMINAL_STATUSES.includes(u.status)).length;

  return {
    is_final: isFinalState(universes),
    phase_number: phaseNumber,
    locked_universes: lockedCount,
    total_universes: universes.length,
    channels_configured: {
      webhook: !!process.env.FINAL_STATE_WEBHOOK_URL,
      email: !!process.env.FINAL_STATE_ALERT_EMAIL,
    },
    last_event: lastEvent
      ? {
          phase_number: lastEvent.phaseNumber,
          detected_at: lastEvent.detectedAt,
          user_id: lastEvent.userId,
          notifications: lastEvent.notifications || [],
        }
      : null,
  };
}

/**
 * Fire the alert through every configured channel using the CURRENT board as
 * the payload, without recording a FinalStateEvent. Lets an operator prove the
 * webhook and mailbox actually work before the one moment that matters.
 */
async function sendTestAlert({ sendMail = null, userId = null } = {}) {
  const universes = await Universe.find().sort({ displayOrder: 1 });
  const phaseNumber = await getCurrentPhaseNumber();
  const event = {
    phaseNumber,
    detectedAt: new Date(),
    userId: userId || 'admin',
    isTest: true,
    snapshot: snapshotOf(universes),
  };

  const results = (await Promise.all([
    dispatchWebhook(event),
    dispatchEmail(event, sendMail),
  ])).filter(Boolean);

  return {
    dispatched: results.length > 0,
    notifications: results,
    would_be_final: isFinalState(universes),
  };
}

module.exports = {
  TERMINAL_STATUSES,
  isFinalState,
  TERMINAL_STATUSES,
  checkFinalState,
  getFinalStateStatus,
  sendTestAlert,
  buildAlertText,
};
