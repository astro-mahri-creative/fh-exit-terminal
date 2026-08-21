const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const buildImpactReportEmail = require('./templates/impactReport');

// ── Email transporter ─────────────────────────────────────────────────────
// Provider-agnostic: prefers generic SMTP env vars so we can swap to
// SendGrid / Mailgun / SES / Postmark / any SMTP host without touching code.
// Falls back to the legacy Gmail App Password setup for backward compat
// with existing deployments. Configure ONE of:
//
//   Generic SMTP (preferred):
//     EMAIL_HOST, EMAIL_PORT (default 587), EMAIL_SECURE (true/false),
//     EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM (display + address)
//
//   SendGrid (API key only — host/user are fixed by the provider):
//     SENDGRID_API_KEY, EMAIL_FROM (must be a verified sender)
//
//   Legacy Gmail App Password:
//     GMAIL_USER, GMAIL_APP_PASSWORD
//
// If none is set, transporter stays null and every send path returns
// a 503 with a provider-neutral error.
let transporter = null;
let emailFrom = process.env.EMAIL_FROM || null;

// The impact-report send is awaited inside /api/codes/finalize, so an
// unresponsive provider would otherwise hold a player's results screen open for
// nodemailer's two-minute default. Bound it for every provider.
const TRANSPORT_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
};

if (process.env.EMAIL_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: process.env.EMAIL_USER
      ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
      : undefined,
    ...TRANSPORT_TIMEOUTS,
  });
  if (!emailFrom) emailFrom = process.env.EMAIL_USER || null;
  console.log('Email transporter initialized via SMTP (host:', process.env.EMAIL_HOST + ')');
} else if (process.env.SENDGRID_API_KEY) {
  // SendGrid's SMTP relay: the username is the literal string "apikey" and
  // the password is the key itself. Kept as its own branch so deployments
  // only have to supply SENDGRID_API_KEY + EMAIL_FROM.
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    ...TRANSPORT_TIMEOUTS,
  });
  if (!emailFrom) {
    console.warn('SENDGRID_API_KEY is set but EMAIL_FROM is not — SendGrid will reject sends without a verified from address.');
  }
  console.log('Email transporter initialized via SendGrid SMTP relay');
} else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    ...TRANSPORT_TIMEOUTS,
  });
  if (!emailFrom) emailFrom = process.env.GMAIL_USER;
  console.log('Email transporter initialized via Gmail App Password');
} else {
  console.warn('No email transporter configured. Set EMAIL_HOST + EMAIL_USER + EMAIL_PASSWORD (preferred), SENDGRID_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD. Email sends will return 503.');
}

// Single send path for every outbound message (impact reports and operational
// alerts alike) so the from-address formatting and the not-configured error
// live in exactly one place.
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    const err = new Error('Email service is not configured on this server');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  return transporter.sendMail({
    from: emailFrom
      ? `Future Hooman Exit Terminal <${emailFrom}>`
      : 'Future Hooman Exit Terminal',
    to,
    subject,
    html,
    text,
  });
}

const {
  Universe,
  UniverseStatusThreshold,
  Code,
  CodeEffect,
  Session,
  SessionCode,
  UserId,
  Phase,
  MetaGameRule,
  PhaxAlertMessage,
  CureStatus,
  AnalyticsLog,
  AdminSettings
} = require('./models');
const { checkFinalState, getFinalStateStatus, sendTestAlert } = require('./services/finalStateAlert');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// MongoDB connection with retry
const MONGO_URI = process.env.MONGODB_URI;
console.log('MONGODB_URI present:', !!MONGO_URI);
console.log('MONGODB_URI prefix:', MONGO_URI ? MONGO_URI.substring(0, 20) + '...' : 'N/A');

const connectWithRetry = (attempt = 1) => {
  console.log(`MongoDB connection attempt ${attempt}...`);
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000
  })
  .then(() => console.log('MongoDB connected successfully to:', mongoose.connection.host))
  .catch(err => {
    console.error(`MongoDB connection attempt ${attempt} failed:`, err.message);
    if (attempt < 5) {
      const delay = Math.min(attempt * 5000, 20000);
      console.log(`Retrying in ${delay / 1000}s...`);
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    } else {
      console.error('MongoDB connection failed after 5 attempts. Server running without DB.');
    }
  });
};
connectWithRetry();

mongoose.connection.on('connected', () => console.log('MongoDB event: connected'));
mongoose.connection.on('disconnected', () => console.log('MongoDB event: disconnected'));
mongoose.connection.on('error', (err) => console.error('MongoDB event error:', err.message));

// ==================== UTILITY FUNCTIONS ====================

// Apply meta-game rules and return modifiers
async function applyMetaGameRules(sessionCodes, universes) {
  const rules = await MetaGameRule.find({ isActive: true }).sort({ priority: -1 });
  const tierMultipliers = {}; // tier number -> multiplier
  const bonusEffects = []; // { universe: 'all'|name, value: number }
  let triggerCure = false;

  for (const rule of rules) {
    let condition, effect;
    try {
      condition = JSON.parse(rule.conditionDefinition);
      effect = JSON.parse(rule.effectDefinition);
    } catch (e) {
      console.error(`Invalid JSON in rule ${rule.ruleName}:`, e);
      continue;
    }

    let conditionMet = false;

    if (rule.conditionType === 'universe_status') {
      if (condition.any_universe_status) {
        conditionMet = universes.some(u => u.status === condition.any_universe_status);
      } else if (condition.universe_name && condition.status) {
        const u = universes.find(u => u.name === condition.universe_name);
        conditionMet = u?.status === condition.status;
      }
    } else if (rule.conditionType === 'code_combination') {
      if (condition.required_codes) {
        const enteredCodes = sessionCodes.map(sc => sc.codeId.code);
        conditionMet = condition.required_codes.every(c => enteredCodes.includes(c));
      }
    } else if (rule.conditionType === 'case_threshold') {
      const totalCases = universes.reduce((sum, u) => sum + u.currentCases, 0);
      if (condition.total_cases_above !== undefined) conditionMet = totalCases >= condition.total_cases_above;
      else if (condition.total_cases_below !== undefined) conditionMet = totalCases <= condition.total_cases_below;
    } else if (rule.conditionType === 'phase_specific') {
      const activePhase = await Phase.findOne({ isActive: true });
      if (condition.phase_number !== undefined) {
        conditionMet = activePhase?.phaseNumber === condition.phase_number;
      }
      if (conditionMet && condition.total_cases_below !== undefined) {
        const totalCases = universes.reduce((sum, u) => sum + u.currentCases, 0);
        conditionMet = totalCases <= condition.total_cases_below;
      }
    }

    if (conditionMet) {
      if (effect.multiplier && effect.applies_to === 'code_tiers' && effect.tiers) {
        for (const tier of effect.tiers) {
          tierMultipliers[tier] = (tierMultipliers[tier] || 1) * effect.multiplier;
        }
      }
      if (effect.bonus_effect) {
        bonusEffects.push(effect.bonus_effect);
      }
      if (effect.trigger_cure) {
        triggerCure = true;
      }
    }
  }

  return { tierMultipliers, bonusEffects, triggerCure };
}

// Shown verbatim by the frontend lockout popup when terminalLocked is on.
const TERMINAL_LOCKED_MESSAGE =
  'YOU MAY NOT ACCESS THE FUTURE HOOMAN EXIT TERMINAL FROM THIS DIMENSION';

// Six lowercase alphanumeric chars, retried until unused. Shared by the admin
// "Generate User ID" action and the public "Create New User ID" home button.
async function generateUniqueUserId(maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toLowerCase();
    if (candidate.length !== 6) continue;
    const exists = await UserId.findOne({ userId: candidate });
    if (!exists) return candidate;
  }
  return null;
}

// Log analytics event
async function logEvent(eventType, sessionId = null, userId = null, eventData = null) {
  try {
    await AnalyticsLog.create({
      eventType,
      sessionId,
      userId,
      eventData: eventData ? JSON.stringify(eventData) : null
    });
  } catch (error) {
    console.error('Error logging event:', error);
  }
}

// Most recent 4:00am ET boundary, DST-aware
function getDailyResetTime() {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etString);
  const etHour = et.getHours();

  // Set to today's 4:00am ET
  et.setHours(4, 0, 0, 0);
  // If it's before 4am ET, roll back to yesterday's 4am
  if (etHour < 4) et.setDate(et.getDate() - 1);

  // Convert back to UTC by computing the offset between local-interpreted ET and real now
  const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime();
  return new Date(et.getTime() + offsetMs);
}

// Calculate universe status based on percentage of initializationCases
function calculateUniverseStatus(currentCases, initializationCases) {
  if (currentCases >= initializationCases) return 'QUARANTINED';
  if (currentCases <= 0) return 'TRANSCENDED';
  if (currentCases >= initializationCases * 0.70) return 'LIBERATED';
  if (currentCases <= initializationCases * 0.30) return 'PRESERVED';
  return 'COMPROMISED';
}

// Update universe status and canSpread
async function updateUniverseStatus(universeId) {
  const universe = await Universe.findById(universeId);
  if (!universe) return;

  const newStatus = calculateUniverseStatus(universe.currentCases, universe.initializationCases);
  universe.status = newStatus;
  universe.canSpread = newStatus === 'COMPROMISED';
  universe.lastUpdated = new Date();
  await universe.save();

  return universe;
}

// Auto-activate CERT (the orientation-issued PHAX containment code) when
// the round can't produce any actionable effect on its own. CERT acts as
// a universal fallback so the user always reaches a usable choice screen
// instead of a dead-end error. Triggers for:
//   - Amplifier-only rounds (PRWC/RMPI alone) — amplifiers need something
//     to multiply, CERT provides the base containment.
//   - Break-code rounds with no eligible target (CURE with no LIBERATED,
//     RVLT with no PRESERVED) — the user's chosen action can't fire on
//     the current universe state, CERT keeps the transmission productive.
//   - Any mix of the above (e.g. PRWC + CURE when no LIBERATED exists).
//
// Returns the (possibly augmented) sessionCodes array. Idempotent: skipped
// if CERT is already in this round.
async function ensureActionableCodes(sessionCodes, session, universes, codesQuery) {
  const hasLiberated = universes.some(u => u.status === 'LIBERATED');
  const hasPreserved = universes.some(u => u.status === 'PRESERVED');

  // A code is "actionable right now" if at least one of its effects can
  // produce a change given the current universe state.
  let actionable = false;
  for (const sc of sessionCodes) {
    const effects = await CodeEffect.find({ codeId: sc.codeId._id });
    for (const e of effects) {
      if (e.effectType === 'standard') { actionable = true; break; }
      if (e.effectType === 'break_liberated' && hasLiberated) { actionable = true; break; }
      if (e.effectType === 'break_preserved' && hasPreserved) { actionable = true; break; }
    }
    if (actionable) break;
  }
  if (actionable) return sessionCodes;

  // Idempotency: don't re-add CERT if it's already in this round.
  if (sessionCodes.some(sc => sc.codeId.code === 'CERT')) return sessionCodes;

  const cert = await Code.findOne({ code: 'CERT', isActive: true });
  if (!cert) return sessionCodes; // CERT not in DB — bail gracefully

  const newSequence = (session.totalCodesEntered || 0) + 1;
  await SessionCode.create({
    sessionId: session._id,
    codeId: cert._id,
    enteredAt: new Date(),
    sequenceOrder: newSequence,
  });
  session.totalCodesEntered = newSequence;
  await session.save();
  await logEvent('cert_auto_applied', session._id, session.userId, {
    reason: 'no_actionable_effect_in_round',
  });

  // Re-fetch with the new CERT included
  return await SessionCode.find(codesQuery).populate('codeId');
}

// Select a random universe with COMPROMISED status and >0 cases
function selectRandomCompromised(universes) {
  const eligible = universes.filter(u => u.currentCases > 0 && u.status === 'COMPROMISED');
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// Round-scoped target resolution for effects whose target is picked at
// random (standard 'random' effects, and the CURE/RVLT break codes, which
// choose among the eligible LIBERATED/PRESERVED universes).
//
// SessionCode used to store no resolved target, so the preview path and the
// finalize path each called Math.random() independently: the choice screen
// would show an effect landing on one universe while finalize applied it to
// another, for every standard code in the game. The first path to resolve an
// effect now writes its pick onto the SessionCode row, and every later read
// reuses it — repeat previews included, so a second look at the choice
// screen can't move a target the user has already been shown.
//
// Deterministic modes ('specific', 'nearest_goal', 'furthest_goal') don't go
// through here; they resolve to the same universe in both paths by
// construction.
function loadResolvedTargets(sessionCodes) {
  const map = new Map();
  for (const sc of sessionCodes) {
    for (const r of sc.resolvedTargets || []) {
      map.set(`${sc._id}:${r.effectId}`, r.universeId);
    }
  }
  return map;
}

// Returns the universe id this effect is pinned to, resolving to `pick` and
// persisting it if this is the first time. Returns null when there was
// nothing eligible to pick. The update is conditional on no resolution
// existing yet, so a concurrent request can't overwrite one; the re-read
// afterwards adopts whichever write won.
async function resolveOnce(resolved, sessionCode, effectId, pick) {
  const key = `${sessionCode._id}:${effectId}`;
  if (resolved.has(key)) return resolved.get(key);
  if (!pick) return null;

  await SessionCode.updateOne(
    { _id: sessionCode._id, 'resolvedTargets.effectId': { $ne: effectId } },
    { $push: { resolvedTargets: { effectId, universeId: pick._id } } }
  );
  const fresh = await SessionCode.findById(sessionCode._id).select('resolvedTargets').lean();
  const hit = (fresh?.resolvedTargets || []).find(r => String(r.effectId) === String(effectId));
  const winner = hit ? hit.universeId : pick._id;
  resolved.set(key, winner);
  return winner;
}

// Select a universe deterministically by how close it is to the goal the
// effect's sign pushes toward. Sign-driven, so one targetMode value serves
// both factions:
//
//   mode             negative effect (containment)   positive effect (proliferation)
//   furthest_goal    most infected  (highest %)      least infected (lowest %)
//   nearest_goal     least infected (lowest %)       most infected (highest %)
//
// furthest_goal is equalizing (compresses the board toward the middle);
// nearest_goal is polarizing (drives status flips). Pairing codes across
// both modes keeps either force from dictating the long-run attractor.
//
// The eligible pool is the same one selectRandomCompromised uses — only
// COMPROMISED universes with cases remaining, i.e. strictly 30-70%. The
// true extremes have already left the pool, so "highest %" really means
// "closest to the 70% LIBERATED line" and "lowest %" means "closest to
// the 30% PRESERVED line".
//
// Sorting by displayOrder before the reduce makes ties resolve identically
// in the preview and finalize paths, which is the point of the whole mode:
// unlike 'random', preview and finalize agree on the target.
function selectByGoalProximity(universes, effectValue, mode) {
  const eligible = universes
    .filter(u => u.currentCases > 0 && u.status === 'COMPROMISED')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (eligible.length === 0) return null;
  const ratio = u => u.currentCases / u.initializationCases;
  const wantsHighest = mode === 'nearest_goal' ? effectValue > 0 : effectValue < 0;
  return eligible.reduce((best, u) =>
    (wantsHighest ? ratio(u) > ratio(best) : ratio(u) < ratio(best)) ? u : best);
}

// Select PHAX alert message
async function selectPhaxAlertMessage() {
  const universes = await Universe.find();
  const cureStatus = await CureStatus.findOne();
  
  // Count universes by status
  const statusCounts = universes.reduce((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1;
    return acc;
  }, {});
  
  const totalCases = universes.reduce((sum, u) => sum + u.currentCases, 0);
  
  // Priority-based selection
  let condition = 'active_stable_states';

  if (statusCounts.QUARANTINED > 0 || statusCounts.TRANSCENDED > 0) {
    condition = 'locked_states';
  } else if (statusCounts.LIBERATED > 3) {
    condition = 'extreme_fheels_victory';
  } else if (statusCounts.LIBERATED > 0) {
    condition = 'liberated_states';
  } else if (cureStatus?.isDiscovered) {
    condition = 'cure_discovery';
  } else if (statusCounts.PRESERVED >= 5) {
    condition = 'optimized_states';
  } else if (statusCounts.COMPROMISED > 0) {
    condition = 'compromised_states';
  } else if (Object.keys(statusCounts).length > 1) {
    condition = 'balanced_states';
  }
  
  // Get matching messages
  const messages = await PhaxAlertMessage.find({ 
    triggerCondition: condition,
    isActive: true 
  });
  
  if (messages.length === 0) {
    // Fallback to any active message
    const fallbackMessages = await PhaxAlertMessage.find({ isActive: true });
    return fallbackMessages.length > 0 ? 
      fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)].messageText :
      'SYSTEM STATUS: MONITORING DIMENSIONAL NETWORK.';
  }
  
  // Return random message from matching set
  return messages[Math.floor(Math.random() * messages.length)].messageText;
}

// Generate alignment narrative
function generateAlignmentNarrative(alignmentScore, totalCodes) {
  const narratives = {
    strongPhax: [
      "Your codes have greatly reinforced PHAX containment. Multiple universes show improved iFLU suppression. The system commends your contribution to stability.",
      "Exceptional containment detected. Your codes have strengthened stability across the universe network. PHAX operations enhanced."
    ],
    moderatePhax: [
      "Your codes have strengthened PHAX containment. iFLU levels are dropping. System efficiency increased.",
      "Containment protocols activated. Your codes support PHAX objectives across multiple universes."
    ],
    slightPhax: [
      "Minor PHAX enhancement detected. Your codes contribute to system stability. Containment proceeding normally.",
      "Your codes align with standard PHAX containment measures. Modest stabilization achieved."
    ],
    neutral: [
      "Your codes show balanced impact. No strong alignment toward either side. Universe network status unchanged.",
      "Neutral code configuration. PHAX and FHEELS influences equally balanced. Network stability maintained."
    ],
    slightFheels: [
      "Warning: Your codes show slight deviation from PHAX protocols. Minor iFLU spread detected. Monitoring increased.",
      "Your codes indicate alternative alignment tendencies. iFLU containment showing minor irregularities."
    ],
    moderateFheels: [
      "Alert: Your codes have weakened containment. iFLU is spreading faster across multiple universes. PHAX security review initiated.",
      "Significant deviation from PHAX protocols detected. Your codes have enabled increased iFLU spread."
    ],
    strongFheels: [
      "Critical Warning: Your codes have severely weakened containment. iFLU has spread dramatically across multiple universes. PHAX security protocols under investigation.",
      "Emergency Alert: Major system compromise detected. Your codes have caused catastrophic containment failure. Multiple universes now operating outside PHAX control."
    ]
  };
  
  let tier;
  if (alignmentScore < -5000) tier = 'strongPhax';
  else if (alignmentScore < -1000) tier = 'moderatePhax';
  else if (alignmentScore < 0) tier = 'slightPhax';
  else if (alignmentScore === 0) tier = 'neutral';
  else if (alignmentScore <= 1000) tier = 'slightFheels';
  else if (alignmentScore <= 5000) tier = 'moderateFheels';
  else tier = 'strongFheels';
  
  const options = narratives[tier];
  return options[Math.floor(Math.random() * options.length)];
}

// Mirror an address and its news/events consent onto the UserId record.
//
// Consent is sticky in one direction only: a later visit that leaves the box
// unchecked does not silently revoke an earlier opt-in (the visitor may simply
// not have noticed the box), but it never fabricates one either. Explicit
// withdrawal is an unsubscribe, handled out of band.
async function persistUserEmailPreference(userId, email, optIn) {
  const update = { $set: { emailAddress: email } };
  if (optIn) {
    update.$set.optInMessaging = true;
    update.$set.optInAt = new Date();
  }
  await UserId.updateOne({ userId }, update);
}

// Build and send the impact report for a finalized session.
//
// Shared by the explicit "email me my report" request and by the automatic
// send that fires at finalize for anyone who already gave us an address at
// the Save Progress gate. Marks the session as sent only after the transport
// resolves, so a provider failure never masquerades as a delivery.
//
// Throws on failure — callers decide whether that's fatal (the explicit
// endpoint) or best-effort (the auto-send).
async function sendImpactReport(session, email, optIn = false) {
  const sessionCodes = await SessionCode.find({ sessionId: session._id })
    .populate('codeId')
    .sort({ sequenceOrder: 1 });

  const codes = sessionCodes
    .filter(sc => sc.codeId)
    .map(sc => sc.codeId.code)
    .join(', ');
  const alignmentNarrative = generateAlignmentNarrative(session.alignmentScore, session.totalCodesEntered);
  const universes = await Universe.find().sort({ displayOrder: 1 });
  const totalAvailableCodes = await Code.countDocuments({ isActive: true });

  const { subject, html, text } = buildImpactReportEmail({
    alignmentNarrative,
    codes,
    alignmentScore: session.alignmentScore,
    totalCodesEntered: session.totalCodesEntered,
    totalCodes: totalAvailableCodes,
    universes,
    optIn,
  });

  const result = await sendMail({ to: email, subject, html, text });

  session.emailAddress = email;
  session.emailSent = true;
  session.optInMessaging = !!optIn;
  await session.save();

  await logEvent('email_sent', session._id, session.userId, { email, optIn });
  console.log('Impact report sent to:', email, '(message id:', result.messageId + ')');

  return result;
}

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    message: 'Exit Terminal API running',
    db_status: dbState[mongoose.connection.readyState] || 'unknown',
    db_host: mongoose.connection.host || 'none',
    env_uri_set: !!process.env.MONGODB_URI
  });
});

// POST /api/session/start - Create new session
app.post('/api/session/start', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id || user_id.length !== 6) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_ID_FORMAT',
        message: 'User ID must be exactly 6 characters'
      });
    }
    
    // Check if user ID exists
    const userIdRecord = await UserId.findOne({ userId: user_id.toLowerCase() });
    if (!userIdRecord) {
      return res.status(404).json({
        success: false,
        error: 'USER_ID_NOT_RECOGNIZED',
        message: 'User ID not found in system'
      });
    }
    
    // Manual lockout — set from the admin panel. Admins are always exempt so
    // they can get in and unlock again.
    if (!userIdRecord.isAdmin) {
      const settings = await AdminSettings.getSettings();
      if (settings.terminalLocked) {
        return res.status(403).json({
          success: false,
          error: 'TERMINAL_LOCKED',
          message: TERMINAL_LOCKED_MESSAGE
        });
      }
    }

    // For non-admin users: check for an existing session since today's 4:00am ET
    if (!userIdRecord.isAdmin) {
      const dailyReset = getDailyResetTime();

      const existingSession = await Session.findOne({
        userId: user_id.toLowerCase(),
        startedAt: { $gte: dailyReset }
      });

      if (existingSession) {
        const settings = await AdminSettings.getSettings();

        if (settings.sameDayReturnMode === 'block' && existingSession.isComplete) {
          return res.status(403).json({
            success: false,
            error: 'SESSION_COMPLETE_TODAY',
            message: 'Access window closed. Try again later.'
          });
        }

        // Rehydrate the current transmission round so the code entry screen can
        // restore its ACTIVATED CODES list after a refresh or back-button. The
        // round is the set of codes entered but not yet transmitted — the same
        // watermark preview/finalize use (enteredAt > finalizedAt; everything
        // when never finalized). Without this the list comes back empty and
        // re-typing a code trips the duplicate guard. Admins never reach this
        // branch (they don't resume), so they can keep re-entering codes freely.
        const roundQuery = { sessionId: existingSession._id };
        if (existingSession.finalizedAt) roundQuery.enteredAt = { $gt: existingSession.finalizedAt };
        const roundCodes = await SessionCode.find(roundQuery)
          .populate('codeId')
          .sort({ sequenceOrder: 1 });
        const activeCodes = roundCodes
          .filter(sc => sc.codeId) // skip any orphaned refs to deleted codes
          .map(sc => ({ code: sc.codeId.code, tier: sc.codeId.tier }));

        // Resume existing session (complete or not)
        return res.json({
          success: true,
          session_token: existingSession.sessionToken,
          session_id: existingSession._id,
          user_id: user_id.toLowerCase(),
          is_admin: userIdRecord.isAdmin,
          email: userIdRecord.emailAddress || existingSession.emailAddress || null,
          active_codes: activeCodes,
          resumed: true,
          message: 'Session resumed'
        });
      }
    }

    // Update user ID usage
    userIdRecord.lastUsedDate = new Date();
    userIdRecord.usageCount += 1;
    await userIdRecord.save();

    // Create session. An address saved on a previous visit rides onto the new
    // session so this visit's impact report can be sent automatically at
    // finalize — a returning visitor shouldn't have to re-enter the address
    // they already gave us to get the same email a first-timer gets.
    const sessionToken = `sess_${uuidv4()}`;
    const session = await Session.create({
      userId: user_id.toLowerCase(),
      sessionToken,
      emailAddress: userIdRecord.emailAddress || undefined,
      optInMessaging: !!userIdRecord.optInMessaging
    });

    await logEvent('session_start', session._id, user_id.toLowerCase());

    res.json({
      success: true,
      session_token: sessionToken,
      session_id: session._id,
      user_id: user_id.toLowerCase(),
      is_admin: userIdRecord.isAdmin,
      // Null unless this user saved an email on a previous visit. Lets the
      // code entry screen skip the "Save Progress?" prompt and the impact
      // report pre-populate its email field.
      email: userIdRecord.emailAddress || null,
      message: 'Session started'
    });

  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error starting session'
    });
  }
});

// POST /api/session/new-userid - Mint a user ID for a walk-up visitor (public).
// Same generator as the admin action, but blocked while the terminal is locked.
app.post('/api/session/new-userid', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    if (settings.terminalLocked) {
      return res.status(403).json({
        success: false,
        error: 'TERMINAL_LOCKED',
        message: TERMINAL_LOCKED_MESSAGE
      });
    }

    const newUserId = await generateUniqueUserId();
    if (!newUserId) {
      return res.status(500).json({
        success: false,
        error: 'GENERATION_FAILED',
        message: 'Could not generate unique user ID'
      });
    }

    await UserId.create({ userId: newUserId, isAdmin: false });
    await logEvent('user_id_self_created', null, newUserId, { newUserId });

    res.json({ success: true, user_id: newUserId, message: 'User ID created' });
  } catch (error) {
    console.error('Error creating user ID:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error creating user ID' });
  }
});

// POST /api/session/save-email - Attach an email to the session AND to the user
// ID record (no email sent). Persisting it on the UserId is what lets a
// returning visitor skip the "Save Progress?" prompt and get their email
// pre-filled on the impact report.
app.post('/api/session/save-email', async (req, res) => {
  try {
    const { session_token, email, opt_in } = req.body;

    if (!session_token || !email) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'session_token and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'INVALID_EMAIL', message: 'Invalid email address' });
    }

    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({ success: false, error: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const optIn = !!opt_in;

    session.emailAddress = normalizedEmail;
    session.optInMessaging = optIn;
    await session.save();

    await persistUserEmailPreference(session.userId, normalizedEmail, optIn);

    await logEvent('email_registered', session._id, session.userId, { email: normalizedEmail, optIn });

    console.log('Email registered for session:', session_token, '→', normalizedEmail, optIn ? '(news opt-in)' : '');

    res.json({ success: true, message: 'Email saved successfully', opt_in: optIn });
  } catch (error) {
    console.error('Error saving email:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error saving email' });
  }
});

// GET /api/universes - Get all universe data
app.get('/api/universes', async (req, res) => {
  try {
    const universes = await Universe.find().sort({ displayOrder: 1 });
    res.json({ success: true, universes });
  } catch (error) {
    console.error('Error fetching universes:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error fetching universe data'
    });
  }
});

// GET /api/network - Universe network data with computed edges (public)
app.get('/api/network', async (req, res) => {
  try {
    const [universes, codeCount] = await Promise.all([
      Universe.find().sort({ displayOrder: 1 }),
      Code.countDocuments({ isActive: true })
    ]);

    // With random targeting, all codes can potentially affect any universe.
    // Generate edges between all universe pairs with weights proportional
    // to the number of active codes (mirrors the old shared-code logic).
    const edges = [];
    for (let i = 0; i < universes.length; i++) {
      for (let j = i + 1; j < universes.length; j++) {
        edges.push({
          source: universes[i]._id.toString(),
          target: universes[j]._id.toString(),
          weight: codeCount
        });
      }
    }

    res.json({ success: true, universes, edges });
  } catch (error) {
    console.error('Error fetching network data:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error fetching network data' });
  }
});

// POST /api/codes/validate - Validate and activate a code
app.post('/api/codes/validate', async (req, res) => {
  try {
    const { session_token, code } = req.body;
    
    // Find session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    // Block code entry only when admin has chosen to block same-hour returns.
    // In 'resume' mode the user may continue activating NEW codes after a
    // prior finalization within the hour; duplicate-code checks below still
    // prevent reprocessing of any code they already submitted.
    if (session.isComplete) {
      const settings = await AdminSettings.getSettings();
      if (settings.sameDayReturnMode === 'block') {
        return res.status(400).json({
          success: false,
          error: 'SESSION_ALREADY_FINALIZED',
          message: 'Your codes have already been processed'
        });
      }
    }

    // Find code
    const codeRecord = await Code.findOne({
      code: code.toUpperCase(),
      isActive: true
    });
    
    if (!codeRecord) {
      // Normalize to uppercase so the analytics aggregation buckets typos
      // case-insensitively and matches how valid codes are stored.
      await logEvent('code_error_invalid', session._id, session.userId, { code: code.toUpperCase() });
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'INVALID_CODE',
        message: 'Code not recognized'
      });
    }
    
    // Admins bypass duplicate checks entirely
    const sessionUser = await UserId.findOne({ userId: session.userId });
    const isAdminUser = sessionUser?.isAdmin === true;

    if (!isAdminUser) {
      // Check if already entered in this session
      const existingSessionCode = await SessionCode.findOne({
        sessionId: session._id,
        codeId: codeRecord._id
      });

      if (existingSessionCode) {
        await logEvent('code_error_duplicate', session._id, session.userId, { code });
        return res.status(400).json({
          success: false,
          valid: false,
          error: 'CODE_ALREADY_ENTERED',
          message: 'This code has already been entered'
        });
      }

      // Check if entered in any prior session for this user
      const priorSessions = await Session.find({
        userId: session.userId,
        _id: { $ne: session._id }
      }).select('_id');

      if (priorSessions.length > 0) {
        const priorIds = priorSessions.map(s => s._id);
        const priorEntry = await SessionCode.findOne({
          sessionId: { $in: priorIds },
          codeId: codeRecord._id
        });

        if (priorEntry) {
          await logEvent('code_error_duplicate_prior_session', session._id, session.userId, { code });
          return res.status(400).json({
            success: false,
            valid: false,
            error: 'CODE_PREVIOUSLY_ENTERED',
            message: 'Code already entered in a previous session'
          });
        }
      }
    }

    // Add code to session
    const sequenceOrder = session.totalCodesEntered + 1;
    await SessionCode.create({
      sessionId: session._id,
      codeId: codeRecord._id,
      sequenceOrder
    });
    
    session.totalCodesEntered += 1;
    await session.save();
    
    await logEvent('code_entered', session._id, session.userId, { 
      code: codeRecord.code,
      tier: codeRecord.tier
    });
    
    const totalAvailableCodes = await Code.countDocuments({ isActive: true });

    // Hide name for status-breaking codes (revealed on impact report)
    const codeEffects = await CodeEffect.find({ codeId: codeRecord._id });
    const isHiddenEffect = codeEffects.some(e => e.effectType === 'break_preserved' || e.effectType === 'break_liberated');

    res.json({
      success: true,
      valid: true,
      code: codeRecord.code,
      code_name: isHiddenEffect ? '???' : codeRecord.name,
      code_tier: codeRecord.tier,
      total_codes_entered: session.totalCodesEntered,
      total_codes: totalAvailableCodes,
      message: 'TERMINAL CODE ACTIVATED'
    });
    
  } catch (error) {
    console.error('Error validating code:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error validating code'
    });
  }
});

// POST /api/codes/preview - Calculate impact options without applying
app.post('/api/codes/preview', async (req, res) => {
  try {
    const { session_token } = req.body;

    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({ success: false, error: 'INVALID_SESSION', message: 'Session not found' });
    }
    if (session.isComplete) {
      const settings = await AdminSettings.getSettings();
      if (settings.sameDayReturnMode === 'block') {
        return res.status(400).json({ success: false, error: 'SESSION_ALREADY_FINALIZED', message: 'Your codes have already been processed' });
      }
    }

    // In resume mode, only consider codes entered since the last finalization.
    // First-time finalize: finalizedAt is null and we include every entry.
    const codesQuery = { sessionId: session._id };
    if (session.finalizedAt) codesQuery.enteredAt = { $gt: session.finalizedAt };
    let sessionCodes = await SessionCode.find(codesQuery).populate('codeId');

    if (sessionCodes.length === 0) {
      return res.status(400).json({ success: false, error: 'NO_CODES_ENTERED', message: 'Please enter at least one code' });
    }
    const universes = await Universe.find();
    let cureStatus = await CureStatus.findOne();
    let isCureActive = cureStatus?.isDiscovered || false;

    // Fallback: every visitor is supposed to have CERT from orientation.
    // If none of their activated codes can produce an actionable effect on
    // their own (e.g. only SIGSEV amplifiers like PRWC/RMPI, or break
    // codes whose target status is currently absent), auto-activate CERT
    // so the choice screen always has at least one selectable option.
    // Idempotent: skipped if CERT is already in this round's codes.
    sessionCodes = await ensureActionableCodes(sessionCodes, session, universes, codesQuery);

    const { tierMultipliers, bonusEffects, triggerCure } = await applyMetaGameRules(sessionCodes, universes);
    if (triggerCure && !isCureActive) isCureActive = true;

    const settings = await AdminSettings.getSettings();
    const effectScale = settings.effectScale || 1;

    // Work on in-memory copies for status tracking during preview
    const simUniverses = universes.map(u => ({
      _id: u._id,
      name: u.name,
      displayOrder: u.displayOrder,
      currentCases: u.currentCases,
      initializationCases: u.initializationCases,
      status: u.status
    }));

    // Split effects into negative (containment) and positive (proliferation)
    const negativeChanges = {};
    const positiveChanges = {};
    universes.forEach(u => {
      const id = u._id.toString();
      negativeChanges[id] = { id: u._id, name: u.name, current_cases: u.currentCases, change: 0 };
      positiveChanges[id] = { id: u._id, name: u.name, current_cases: u.currentCases, change: 0 };
    });

    const previewStatusMessages = [];
    // Targets already pinned for this round (see resolveOnce). Built after
    // ensureActionableCodes so an auto-added CERT is included.
    const resolvedTargets = loadResolvedTargets(sessionCodes);
    // Independent sim copies for option A vs option B so RVLT/CURE only
    // affect the bucket they belong to (CURE -> A only, RVLT -> B only).
    const simUniversesA = simUniverses.map(u => ({ ...u }));
    const simUniversesB = simUniverses.map(u => ({ ...u }));
    const excludedA = new Set();
    const excludedB = new Set();
    // Synthetic masked rows for CURE/RVLT — the user knows the code WILL
    // act, but the universe and magnitude are hidden until finalize so
    // the choice retains a "?" element. The actual delta is NOT added to
    // negativeChanges/positiveChanges and NOT factored into net_change.
    const optionAMaskedRows = [];
    const optionBMaskedRows = [];

    // --- Pass 1: process status-breaking codes (RVLT/CURE) first ---
    // CURE (break_liberated) is a containment effect — only contributes
    // to option A. RVLT (break_preserved) is a proliferation effect —
    // only contributes to option B. The other bucket sees no change.
    // Each individual code activation picks ONE random eligible universe.
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;

        if (effect.effectType === 'break_preserved') {
          // Proliferation: only affects option B's sim
          const preserved = simUniversesB.filter(u => u.status === 'PRESERVED');
          if (preserved.length === 0) continue;
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            preserved[Math.floor(Math.random() * preserved.length)]);
          // A pin from an earlier preview can point at a universe that has
          // since left PRESERVED (another player finalized). Skipping keeps
          // preview and finalize agreeing, which is the point of pinning.
          const target = preserved.find(u => u._id.equals(pinnedId));
          if (!target) continue;
          // 35% — past the PRESERVED upper bound (30%) so the status
          // actually changes to COMPROMISED. Always an increase from
          // any PRESERVED universe (which is at ≤30%).
          const newCases = Math.ceil(target.initializationCases * 0.35);
          target.currentCases = newCases;
          target.status = calculateUniverseStatus(newCases, target.initializationCases);
          excludedB.add(target._id.toString());
          optionBMaskedRows.push({
            id: `masked-${code.code}-${optionBMaskedRows.length}`,
            name: '?????',
            current_cases: 0,
            change: '???',
            projected_cases: 0,
            masked: true,
          });
          // No status message — the masked row alone signals "something
          // will happen", without naming the code as the cause.
          continue;
        }
        if (effect.effectType === 'break_liberated') {
          // Containment: only affects option A's sim
          const liberated = simUniversesA.filter(u => u.status === 'LIBERATED');
          if (liberated.length === 0) continue;
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            liberated[Math.floor(Math.random() * liberated.length)]);
          const target = liberated.find(u => u._id.equals(pinnedId));
          if (!target) continue;
          // 65% — past the LIBERATED lower bound (70%) so the status
          // actually changes to COMPROMISED. Always a decrease from
          // any LIBERATED universe (which is at ≥70%).
          const newCases = Math.floor(target.initializationCases * 0.65);
          target.currentCases = newCases;
          target.status = calculateUniverseStatus(newCases, target.initializationCases);
          excludedA.add(target._id.toString());
          optionAMaskedRows.push({
            id: `masked-${code.code}-${optionAMaskedRows.length}`,
            name: '?????',
            current_cases: 0,
            change: '???',
            projected_cases: 0,
            masked: true,
          });
          // No status message — the masked row alone signals "something
          // will happen", without naming the code as the cause.
          continue;
        }
      }
    }

    // --- Pass 2: process all standard numerical effects ---
    // Each effect runs against the sim for its sign-aligned bucket only:
    // negative effects mutate simUniversesA (containment); positive
    // mutate simUniversesB (proliferation). This keeps the two options
    // independent, which is what the choice screen represents.
    const amplifyMultipliers = [];
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });
      const tierMultiplier = tierMultipliers[code.tier] || 1;

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;
        if (effect.effectType === 'break_preserved' || effect.effectType === 'break_liberated') continue;

        if (effect.effectType === 'amplify') {
          amplifyMultipliers.push(effect.effectValue);
          continue;
        }

        const effectValue = Math.floor(effect.effectValue * tierMultiplier * effectScale);
        if (effectValue === 0) continue;
        const isNegative = effectValue < 0;
        const sim = isNegative ? simUniversesA : simUniversesB;
        const excluded = isNegative ? excludedA : excludedB;
        const bucket = isNegative ? negativeChanges : positiveChanges;

        // Resolve target (excluding RVLT/CURE universes).
        // NOTE: this block is mirrored in the finalize path — keep the two
        // in sync or the choice screen will misreport what finalize does.
        let targetUniverse;
        if (effect.targetMode === 'random') {
          const pool = sim.filter(u => !excluded.has(u._id.toString()));
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            selectRandomCompromised(pool));
          targetUniverse = pinnedId ? pool.find(u => u._id.equals(pinnedId)) : null;
          if (!targetUniverse) continue;
        } else if (effect.targetMode === 'nearest_goal' || effect.targetMode === 'furthest_goal') {
          targetUniverse = selectByGoalProximity(
            sim.filter(u => !excluded.has(u._id.toString())),
            effectValue,
            effect.targetMode
          );
          if (!targetUniverse) continue;
        } else {
          targetUniverse = sim.find(u => u._id.equals(effect.universeId));
          if (targetUniverse && excluded.has(targetUniverse._id.toString())) continue;
        }
        if (!targetUniverse) continue;

        // Status-based blocking
        if (targetUniverse.status === 'QUARANTINED' || targetUniverse.status === 'TRANSCENDED') continue;
        if (targetUniverse.status === 'LIBERATED') continue;
        if (targetUniverse.status === 'PRESERVED' && effectValue > 0) continue;

        const universeId = targetUniverse._id.toString();
        if (bucket[universeId]) bucket[universeId].change += effectValue;

        // Update sim state for the active bucket only
        const previousStatus = targetUniverse.status;
        targetUniverse.currentCases = Math.max(0, targetUniverse.currentCases + effectValue);
        targetUniverse.status = calculateUniverseStatus(targetUniverse.currentCases, targetUniverse.initializationCases);

        if (targetUniverse.status !== previousStatus) {
          previewStatusMessages.push({
            code: code.code,
            option: isNegative ? 'a' : 'b',
            message: `STATUS of ${targetUniverse.name} is now ${targetUniverse.status}`
          });
        }
      }
    }

    // --- Pass 3: apply amplify multipliers to all accumulated changes ---
    if (amplifyMultipliers.length > 0) {
      const combinedMultiplier = amplifyMultipliers.reduce((acc, m) => acc * m, 1);
      for (const uid of Object.keys(negativeChanges)) {
        negativeChanges[uid].change = Math.floor(negativeChanges[uid].change * combinedMultiplier);
      }
      for (const uid of Object.keys(positiveChanges)) {
        positiveChanges[uid].change = Math.floor(positiveChanges[uid].change * combinedMultiplier);
      }
    }

    // Split bonus effects by sign
    for (const bonus of bonusEffects) {
      if (bonus.universe === 'all') {
        for (const uid of Object.keys(negativeChanges)) {
          if (bonus.value < 0) negativeChanges[uid].change += bonus.value;
          else positiveChanges[uid].change += bonus.value;
        }
      } else {
        const universe = universes.find(u => u.name === bonus.universe);
        if (universe) {
          const uid = universe._id.toString();
          if (bonus.value < 0) negativeChanges[uid].change += bonus.value;
          else positiveChanges[uid].change += bonus.value;
        }
      }
    }

    const netNegative = Object.values(negativeChanges).reduce((sum, u) => sum + u.change, 0);
    const netPositive = Object.values(positiveChanges).reduce((sum, u) => sum + u.change, 0);

    // Guard: if neither option has any real or masked effect the user
    // would land on a choice screen with both buttons disabled and no
    // way forward. This happens most often when only SIGSEV amplifier
    // codes (PRWC/RMPI) were activated — amplifiers multiply existing
    // changes but produce nothing on their own.
    const hasOptionA = netNegative !== 0 || optionAMaskedRows.length > 0;
    const hasOptionB = netPositive !== 0 || optionBMaskedRows.length > 0;
    // Safety net: with the CERT fallback in ensureActionableCodes this
    // should be unreachable. It can only fire if CERT is missing from
    // the codes collection or has been deactivated, which would be a
    // deployment/admin issue worth surfacing rather than a silent UI
    // dead-end.
    if (!hasOptionA && !hasOptionB) {
      console.error('Preview empty even after CERT fallback — verify CERT exists and isActive in the codes collection.');
      return res.status(500).json({
        success: false,
        error: 'NO_ACTIONABLE_EFFECT',
        message: 'No actionable effect could be computed for this transmission. Contact an admin.'
      });
    }

    res.json({
      success: true,
      option_a: {
        label: 'iFLU CONTAINMENT PROTOCOL',
        description: 'Apply infection reduction effects',
        universes: [
          ...Object.values(negativeChanges).map(u => ({
            ...u,
            projected_cases: Math.max(0, u.current_cases + u.change)
          })),
          ...optionAMaskedRows,
        ],
        net_change: netNegative
      },
      option_b: {
        label: 'iFLU PROLIFERATION PROTOCOL',
        description: 'Apply infection increase effects',
        universes: [
          ...Object.values(positiveChanges).map(u => ({
            ...u,
            projected_cases: Math.max(0, u.current_cases + u.change)
          })),
          ...optionBMaskedRows,
        ],
        net_change: netPositive
      },
      cure_triggered: isCureActive,
      total_codes_entered: session.totalCodesEntered,
      status_messages: previewStatusMessages
    });

  } catch (error) {
    console.error('Error previewing codes:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error previewing codes' });
  }
});

// POST /api/codes/finalize - Process all codes and calculate impact
app.post('/api/codes/finalize', async (req, res) => {
  try {
    const { session_token, choice } = req.body;

    // Validate choice parameter
    if (!choice || !['a', 'b'].includes(choice)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CHOICE',
        message: 'Must specify choice: "a" (containment) or "b" (proliferation)'
      });
    }

    // Find session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }

    // Block re-finalization only in 'block' mode. In 'resume' mode, processing
    // a second round simply applies the codes entered since the last finalize.
    if (session.isComplete) {
      const settings = await AdminSettings.getSettings();
      if (settings.sameDayReturnMode === 'block') {
        return res.status(400).json({
          success: false,
          error: 'SESSION_ALREADY_FINALIZED',
          message: 'Your codes have already been processed'
        });
      }
    }

    // Only process codes entered since the last finalization. First-time
    // finalize sees every code; subsequent rounds only see new entries.
    const codesQuery = { sessionId: session._id };
    if (session.finalizedAt) codesQuery.enteredAt = { $gt: session.finalizedAt };
    let sessionCodes = await SessionCode.find(codesQuery).populate('codeId');

    if (sessionCodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_CODES_ENTERED',
        message: 'Please enter at least one code'
      });
    }

    // Get all universes (needed for both CERT-fallback check and the
    // main computation below)
    const universes = await Universe.find();

    // Defense in depth: preview should have already auto-applied CERT
    // when needed, but if finalize is hit directly (or in resume mode
    // after no preview), make sure the same fallback runs here too.
    sessionCodes = await ensureActionableCodes(sessionCodes, session, universes, codesQuery);

    // Get cure status
    let cureStatus = await CureStatus.findOne();
    let isCureActive = cureStatus?.isDiscovered || false;

    const universeChanges = {};

    // Initialize tracking
    universes.forEach(u => {
      universeChanges[u._id.toString()] = {
        id: u._id,
        name: u.name,
        previousCases: u.currentCases,
        change: 0,
        newCases: u.currentCases
      };
    });

    // Apply meta-game rules
    const { tierMultipliers, bonusEffects, triggerCure } = await applyMetaGameRules(sessionCodes, universes);

    // Trigger cure from meta-game rule if not already active
    if (triggerCure && !isCureActive) {
      if (!cureStatus) {
        cureStatus = await CureStatus.create({
          isDiscovered: true,
          discoveredAt: new Date(),
          discoveredBySessionId: session._id,
          cureTriggerType: 'condition'
        });
      } else {
        cureStatus.isDiscovered = true;
        cureStatus.discoveredAt = new Date();
        cureStatus.discoveredBySessionId = session._id;
        cureStatus.cureTriggerType = 'condition';
        await cureStatus.save();
      }
      isCureActive = true;
    }

    // Load effect scale
    const settings = await AdminSettings.getSettings();
    const effectScale = settings.effectScale || 1;

    // In-memory status tracking so random selection reflects prior effects
    const liveUniverses = universes.map(u => ({
      _id: u._id,
      name: u.name,
      displayOrder: u.displayOrder,
      currentCases: u.currentCases,
      initializationCases: u.initializationCases,
      status: u.status
    }));

    const statusMessages = [];
    const excludedUniverseIds = new Set();
    // Targets pinned during preview (see resolveOnce). Finalize reuses them
    // so the board moves exactly where the choice screen said it would. A
    // session finalized without ever previewing resolves and pins here.
    const resolvedTargets = loadResolvedTargets(sessionCodes);

    // --- Pass 1: process status-breaking codes (RVLT/CURE) first ---
    // Status-breaking codes are tied to a specific choice direction:
    //   CURE   (break_liberated)  -> containment (option A) only
    //   RVLT   (break_preserved)  -> proliferation (option B) only
    // If the user picked the opposite option, the code does NOT execute
    // and produces no change/messaging. This keeps the impact strictly
    // single-direction, matching the choice the user made.
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;

        if (effect.effectType === 'break_preserved') {
          if (choice !== 'b') continue; // RVLT only fires on proliferation
          const preserved = liveUniverses.filter(u => u.status === 'PRESERVED');
          if (preserved.length === 0) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            preserved[Math.floor(Math.random() * preserved.length)]);
          const target = preserved.find(u => u._id.equals(pinnedId));
          if (!target) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          // 35% — past the PRESERVED upper bound (30%) so the status
          // actually changes to COMPROMISED. Always an increase from
          // any PRESERVED universe (≤30%).
          const newCases = Math.ceil(target.initializationCases * 0.35);
          const uid = target._id.toString();
          universeChanges[uid].change += newCases - target.currentCases;
          target.currentCases = newCases;
          const newStatus = calculateUniverseStatus(newCases, target.initializationCases);
          target.status = newStatus;
          excludedUniverseIds.add(uid);
          statusMessages.push({ code: code.code, message: `STATUS of ${target.name} is now ${newStatus}` });
          continue;
        }
        if (effect.effectType === 'break_liberated') {
          if (choice !== 'a') continue; // CURE only fires on containment
          const liberated = liveUniverses.filter(u => u.status === 'LIBERATED');
          if (liberated.length === 0) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            liberated[Math.floor(Math.random() * liberated.length)]);
          const target = liberated.find(u => u._id.equals(pinnedId));
          if (!target) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          // 65% — past the LIBERATED lower bound (70%) so the status
          // actually changes to COMPROMISED. Always a decrease from
          // any LIBERATED universe (≥70%).
          const newCases = Math.floor(target.initializationCases * 0.65);
          const uid = target._id.toString();
          universeChanges[uid].change += newCases - target.currentCases;
          target.currentCases = newCases;
          const newStatus = calculateUniverseStatus(newCases, target.initializationCases);
          target.status = newStatus;
          excludedUniverseIds.add(uid);
          statusMessages.push({ code: code.code, message: `STATUS of ${target.name} is now ${newStatus}` });
          continue;
        }
      }
    }

    // --- Pass 2: process standard numerical effects ---
    const finalizeAmplifyMultipliers = [];
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });
      const tierMultiplier = tierMultipliers[code.tier] || 1;

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;
        if (effect.effectType === 'break_preserved' || effect.effectType === 'break_liberated') continue;

        if (effect.effectType === 'amplify') {
          finalizeAmplifyMultipliers.push(effect.effectValue);
          continue;
        }

        const effectValue = Math.floor(effect.effectValue * tierMultiplier * effectScale);

        // Only apply effects matching the chosen option
        if (choice === 'a' && effectValue >= 0) continue;
        if (choice === 'b' && effectValue <= 0) continue;

        // Resolve target universe (excluding RVLT/CURE universes).
        // NOTE: this block is mirrored in the preview path — keep the two
        // in sync or the choice screen will misreport what finalize does.
        let targetUniverse;
        if (effect.targetMode === 'random') {
          const pool = liveUniverses.filter(u => !excludedUniverseIds.has(u._id.toString()));
          const pinnedId = await resolveOnce(resolvedTargets, sessionCode, effect._id,
            selectRandomCompromised(pool));
          targetUniverse = pinnedId ? pool.find(u => u._id.equals(pinnedId)) : null;
          if (!targetUniverse) continue;
        } else if (effect.targetMode === 'nearest_goal' || effect.targetMode === 'furthest_goal') {
          targetUniverse = selectByGoalProximity(
            liveUniverses.filter(u => !excludedUniverseIds.has(u._id.toString())),
            effectValue,
            effect.targetMode
          );
          if (!targetUniverse) continue;
        } else {
          targetUniverse = liveUniverses.find(u => u._id.equals(effect.universeId));
          if (targetUniverse && excludedUniverseIds.has(targetUniverse._id.toString())) continue;
        }
        if (!targetUniverse) continue;

        // Status-based blocking
        if (targetUniverse.status === 'QUARANTINED' || targetUniverse.status === 'TRANSCENDED') continue;
        if (targetUniverse.status === 'LIBERATED') continue;
        if (targetUniverse.status === 'PRESERVED' && effectValue > 0) continue;

        const universeId = targetUniverse._id.toString();
        if (universeChanges[universeId]) {
          universeChanges[universeId].change += effectValue;
        }

        // Update in-memory state for subsequent random selections
        const previousStatus = targetUniverse.status;
        targetUniverse.currentCases = Math.max(0, targetUniverse.currentCases + effectValue);
        targetUniverse.status = calculateUniverseStatus(targetUniverse.currentCases, targetUniverse.initializationCases);

        if (targetUniverse.status !== previousStatus) {
          statusMessages.push({ code: code.code, message: `STATUS of ${targetUniverse.name} is now ${targetUniverse.status}` });
        }
      }

      // Check if this is a cure code
      if (code.isCureCode && !isCureActive) {
        if (!cureStatus) {
          cureStatus = await CureStatus.create({
            isDiscovered: true,
            discoveredAt: new Date(),
            discoveredBySessionId: session._id,
            cureTriggerType: 'code'
          });
        } else {
          cureStatus.isDiscovered = true;
          cureStatus.discoveredAt = new Date();
          cureStatus.discoveredBySessionId = session._id;
          cureStatus.cureTriggerType = 'code';
          await cureStatus.save();
        }
        isCureActive = true;
      }
    }

    // --- Pass 3: apply amplify multipliers to all accumulated changes ---
    if (finalizeAmplifyMultipliers.length > 0) {
      const combinedMultiplier = finalizeAmplifyMultipliers.reduce((acc, m) => acc * m, 1);
      for (const universeId in universeChanges) {
        universeChanges[universeId].change = Math.floor(universeChanges[universeId].change * combinedMultiplier);
      }
    }

    // Apply bonus effects from meta-game rules — only matching sign
    for (const bonus of bonusEffects) {
      if (choice === 'a' && bonus.value >= 0) continue;
      if (choice === 'b' && bonus.value <= 0) continue;

      if (bonus.universe === 'all') {
        for (const universeId in universeChanges) {
          universeChanges[universeId].change += bonus.value;
        }
      } else {
        const universe = universes.find(u => u.name === bonus.universe);
        if (universe) {
          universeChanges[universe._id.toString()].change += bonus.value;
        }
      }
    }
    
    // Apply changes to universes
    let totalAlignmentScore = 0;
    
    for (const [universeId, changeData] of Object.entries(universeChanges)) {
      const universe = await Universe.findById(universeId);
      if (!universe) continue;
      
      const newCases = Math.max(0, universe.currentCases + changeData.change);
      universe.currentCases = newCases;
      if (changeData.change !== 0) {
        universe.lastImpactDirection = changeData.change > 0 ? 'positive' : 'negative';
      }
      await universe.save();

      // Update status
      await updateUniverseStatus(universeId);
      
      // Update change data
      changeData.newCases = newCases;
      
      // Add to alignment score
      totalAlignmentScore += changeData.change;
    }
    
    // Update session
    session.alignmentScore = totalAlignmentScore;
    session.choice = choice;
    session.finalizedAt = new Date();
    session.isComplete = true;
    await session.save();
    
    // Get updated universes
    const updatedUniverses = await Universe.find().sort({ displayOrder: 1 });
    
    // Get PHAX alert message
    const phaxAlert = await selectPhaxAlertMessage();
    
    // Generate alignment narrative
    const alignmentNarrative = generateAlignmentNarrative(
      totalAlignmentScore,
      session.totalCodesEntered
    );
    
    await logEvent('session_finalized', session._id, session.userId, {
      totalCodes: session.totalCodesEntered,
      alignmentScore: totalAlignmentScore,
      choice
    });

    const totalAvailableCodes = await Code.countDocuments({ isActive: true });

    // Did this transmission end the game? Checked after the writes above so
    // it sees the board the player just produced. Idempotent per phase, and
    // it never throws — see services/finalStateAlert.js.
    const finalState = await checkFinalState({
      universes: updatedUniverses,
      session,
      sendMail,
      logEvent,
    });

    // Auto-send the impact report to anyone who already has an address on file
    // — from this session's Save Progress gate or a previous visit.
    //
    // Awaited rather than fired and forgotten, so the results screen can say
    // "sent" only when it actually was. The transporter carries explicit
    // socket timeouts (see its construction above) to bound how long a sulking
    // mail provider can hold this response open; a failure here is logged and
    // reported as "not sent", never as a failed transmission.
    let reportEmailSentTo = null;
    if (session.emailAddress && transporter) {
      try {
        await sendImpactReport(session, session.emailAddress, session.optInMessaging);
        reportEmailSentTo = session.emailAddress;
      } catch (err) {
        console.error('Auto impact-report send failed for', session.emailAddress + ':', err.message);
      }
    }

    res.json({
      success: true,
      universes: updatedUniverses.map(u => ({
        id: u._id,
        name: u.name,
        current_cases: u.currentCases,
        previous_cases: universeChanges[u._id.toString()]?.previousCases || u.currentCases,
        // The impact chart scales every bar against this, so a universe's
        // share of its own capacity is comparable across universes whose raw
        // counts differ by two orders of magnitude.
        initialization_cases: u.initializationCases,
        status: u.status,
        change: universeChanges[u._id.toString()]?.change || 0
      })),
      phax_alert: phaxAlert,
      alignment_narrative: alignmentNarrative,
      alignment_score: totalAlignmentScore,
      total_codes_entered: session.totalCodesEntered,
      total_codes: totalAvailableCodes,
      cure_active: isCureActive,
      status_messages: statusMessages,
      final_state: !!finalState.isFinal,
      report_email_sent_to: reportEmailSentTo
    });

  } catch (error) {
    console.error('Error finalizing codes:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error processing codes'
    });
  }
});

// POST /api/email/send - Send impact report email
app.post('/api/email/send', async (req, res) => {
  try {
    const { session_token, email, opt_in } = req.body;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Invalid email address'
      });
    }
    
    // Find session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    const optIn = !!opt_in;
    const normalizedEmail = email.toLowerCase().trim();

    // Don't report success if no transporter is configured — that path
    // was silently dropping outbound mail while the client got a "sent"
    // toast. Surface a real error instead.
    if (!transporter) {
      console.error('Email send aborted: no email transporter configured. Email NOT delivered.');
      console.error('Intended recipient:', normalizedEmail);
      return res.status(503).json({
        success: false,
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Email service is not configured on this server'
      });
    }

    try {
      await sendImpactReport(session, normalizedEmail, optIn);
    } catch (sendErr) {
      // Surface the actual provider-side failure to the client (and logs)
      // instead of pretending the send succeeded.
      console.error('Email transport rejected the send:', sendErr);
      return res.status(502).json({
        success: false,
        error: 'EMAIL_DELIVERY_FAILED',
        message: 'Email could not be delivered',
        detail: sendErr.message
      });
    }

    // The address and its consent flag belong to the visitor, not just this
    // visit — mirror both onto the UserId so the next session pre-populates
    // and a mailing-list export sees the opt-in.
    await persistUserEmailPreference(session.userId, normalizedEmail, optIn);

    res.json({
      success: true,
      message: 'Impact report sent successfully'
    });

  } catch (error) {
    console.error('Error in /api/email/send handler:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error processing email request',
      detail: error.message
    });
  }
});

// GET /api/messages/alerts - Get PHAX alert messages
app.get('/api/messages/alerts', async (req, res) => {
  try {
    const message = await selectPhaxAlertMessage();
    res.json({ success: true, message });
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error fetching alerts'
    });
  }
});

// POST /api/admin/generate-userid - Generate new user ID (admin only)
app.post('/api/admin/generate-userid', async (req, res) => {
  try {
    const { session_token } = req.body;
    
    // Verify admin session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Admin access required'
      });
    }
    
    const newUserId = await generateUniqueUserId();
    if (!newUserId) {
      return res.status(500).json({
        success: false,
        error: 'GENERATION_FAILED',
        message: 'Could not generate unique user ID'
      });
    }

    // Create user ID
    await UserId.create({
      userId: newUserId,
      isAdmin: false
    });


    await logEvent('user_id_generated', session._id, session.userId, { newUserId });
    
    res.json({
      success: true,
      user_id: newUserId,
      message: 'User ID generated successfully'
    });
    
  } catch (error) {
    console.error('Error generating user ID:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error generating user ID'
    });
  }
});

// POST /api/admin/settings/toggle-return-mode - Toggle same-hour return behavior (admin only)
app.post('/api/admin/settings/toggle-return-mode', async (req, res) => {
  try {
    const { session_token } = req.body;
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    const userIdRecord = await UserId.findOne({ userId: session.userId });
    if (!userIdRecord || !userIdRecord.isAdmin) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Admin access required' });
    }

    const settings = await AdminSettings.getSettings();
    const previousReturnMode = settings.sameDayReturnMode;
    settings.sameDayReturnMode = settings.sameDayReturnMode === 'resume' ? 'block' : 'resume';
    await settings.save();

    // Same silent-mutation problem as effectScale, lower analytical stakes:
    // this one changes whether a same-day return resumes or starts fresh,
    // which shows up in the record as extra codes on one session vs a new
    // session. Logged so that shape is explainable after the fact.
    await logEvent('return_mode_changed', session._id, session.userId, {
      from: previousReturnMode,
      to: settings.sameDayReturnMode
    });

    res.json({ success: true, sameDayReturnMode: settings.sameDayReturnMode });
  } catch (error) {
    console.error('Error toggling return mode:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error updating settings' });
  }
});

// POST /api/admin/settings/toggle-lock - Lock/unlock the terminal for non-admins
app.post('/api/admin/settings/toggle-lock', async (req, res) => {
  try {
    const { session_token } = req.body;
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    const userIdRecord = await UserId.findOne({ userId: session.userId });
    if (!userIdRecord || !userIdRecord.isAdmin) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Admin access required' });
    }

    const settings = await AdminSettings.getSettings();
    settings.terminalLocked = !settings.terminalLocked;
    await settings.save();

    await logEvent('terminal_lock_toggled', session._id, session.userId, {
      terminalLocked: settings.terminalLocked
    });

    res.json({ success: true, terminalLocked: settings.terminalLocked });
  } catch (error) {
    console.error('Error toggling terminal lock:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error updating settings' });
  }
});

// POST /api/admin/reset-universes - Reset universe statistics (admin only)
app.post('/api/admin/reset-universes', async (req, res) => {
  try {
    const { session_token } = req.body;
    
    // Verify admin session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Admin access required'
      });
    }
    
    // Reset all universes to the initial spread defined in initDatabase.js
    // (saved as `initialCurrentCases` on each Universe doc). Falls back to
    // 50% of initializationCases for legacy docs that predate the field.
    const universes = await Universe.find();
    for (const universe of universes) {
      universe.currentCases = universe.initialCurrentCases ?? Math.floor(universe.initializationCases * 0.5);
      universe.lastImpactDirection = null;
      await universe.save();
      await updateUniverseStatus(universe._id);
    }
    
    // Reset cure status
    const cureStatus = await CureStatus.findOne();
    if (cureStatus) {
      cureStatus.isDiscovered = false;
      cureStatus.discoveredAt = null;
      cureStatus.discoveredBySessionId = null;
      await cureStatus.save();
    }
    
    // End current phase
    await Phase.updateMany({ isActive: true }, { 
      isActive: false,
      endedAt: new Date()
    });
    
    // Create new phase
    const lastPhase = await Phase.findOne().sort({ phaseNumber: -1 });
    const newPhaseNumber = lastPhase ? lastPhase.phaseNumber + 1 : 1;
    
    await Phase.create({
      phaseNumber: newPhaseNumber,
      phaseName: `Phase ${newPhaseNumber}`,
      isActive: true
    });
    
    // UserId.lastUsedDate is deliberately NOT cleared here. It is a permanent
    // record of when each visitor last logged in, kept across resets so we can
    // find lapsed users for re-engagement. It has no gameplay function — the
    // once-per-day gate reads Sessions (see /api/session/start), not this field.

    // The analytics phase selector derives its numbering from the ORDER of
    // system_reset events, not from this field — Phase docs get wiped by
    // initDatabase.js while AnalyticsLog survives, so stored phaseNumbers
    // restart while resets keep accruing. Stamped anyway so the event stream
    // is self-describing when read directly.
    await logEvent('system_reset', session._id, session.userId, {
      phaseNumber: newPhaseNumber
    });
    
    res.json({
      success: true,
      message: 'Universe statistics reset complete'
    });
    
  } catch (error) {
    console.error('Error resetting universes:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error resetting system'
    });
  }
});

// Shared admin guard: resolves the session and confirms the user is an admin.
// Returns the session on success, or null after having already answered the
// request with the appropriate 404/403.
async function requireAdmin(req, res) {
  const token = req.body?.session_token || req.query?.session_token;
  const session = await Session.findOne({ sessionToken: token });
  if (!session) {
    res.status(404).json({ success: false, error: 'INVALID_SESSION', message: 'Session not found' });
    return null;
  }
  const adminUser = await UserId.findOne({ userId: session.userId });
  if (!adminUser || !adminUser.isAdmin) {
    res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'Admin access required' });
    return null;
  }
  return session;
}

// GET /api/admin/final-state - Is the network locked, and did the alert go out?
app.get('/api/admin/final-state', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const status = await getFinalStateStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Error reading final state:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error reading final state' });
  }
});

// POST /api/admin/final-state/test - Fire a test alert through every
// configured channel without recording an event. Lets an operator confirm the
// webhook and mailbox work before the one moment they need to.
app.post('/api/admin/final-state/test', async (req, res) => {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const result = await sendTestAlert({ sendMail, userId: session.userId });
    await logEvent('final_state_alert_test', session._id, session.userId, {
      channels: result.notifications.map(n => ({ channel: n.channel, ok: n.ok })),
    });

    res.json({
      success: true,
      message: result.dispatched
        ? 'Test alert dispatched'
        : 'No alert channels are configured (set FINAL_STATE_ALERT_EMAIL and/or FINAL_STATE_WEBHOOK_URL)',
      ...result,
    });
  } catch (error) {
    console.error('Error sending test final-state alert:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error sending test alert' });
  }
});

// GET /api/admin/analytics - Get system analytics (admin only)
app.get('/api/admin/analytics', async (req, res) => {
  try {
    const { session_token } = req.query;
    
    // Verify admin session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Admin access required'
      });
    }
    
    // Get analytics
    const totalSessions = await Session.countDocuments();
    const completedSessions = await Session.countDocuments({ isComplete: true });
    const totalUsers = await UserId.countDocuments({ isAdmin: false });
    
    // Get today's sessions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = await Session.countDocuments({ 
      startedAt: { $gte: today }
    });
    
    // Get current phase
    const currentPhase = await Phase.findOne({ isActive: true });
    
    // Get alignment distribution
    const sessions = await Session.find({ isComplete: true });
    const alignmentDistribution = {
      phax: sessions.filter(s => s.alignmentScore < 0).length,
      fheels: sessions.filter(s => s.alignmentScore > 0).length,
      neutral: sessions.filter(s => s.alignmentScore === 0).length
    };

    const settings = await AdminSettings.getSettings();

    res.json({
      success: true,
      analytics: {
        totalSessions,
        completedSessions,
        totalUsers,
        todaySessions,
        currentPhase: currentPhase?.phaseName || 'No active phase',
        alignmentDistribution,
        sameDayReturnMode: settings.sameDayReturnMode,
        effectScale: settings.effectScale,
        terminalLocked: settings.terminalLocked
      }
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error fetching analytics'
    });
  }
});

// GET /api/admin/analytics/detailed - Dataset age + per-user + per-code stats (admin only)
app.get('/api/admin/analytics/detailed', async (req, res) => {
  try {
    const { session_token } = req.query;

    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({ success: false, error: 'INVALID_SESSION', message: 'Session not found' });
    }

    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'Admin access required' });
    }

    // Resolve the current visitor roster so we can limit user/code stats to it.
    //
    // This tests membership of the live roster rather than subtracting a list of
    // admin ids, because AnalyticsLog is append-only and outlives UserId records
    // (see below). An id that was staff when its events were logged but has since
    // been deleted — admin1/2/3, phaxad and the tvwall kiosk all went in a one-off
    // prod update — matches no admin list, so subtracting one would quietly
    // promote its history to a player's and rank it on the leaderboard.
    const visitorIds = new Set(
      (await UserId.find({ isAdmin: false }).select('userId')).map(u => u.userId)
    );

    // ──────────────────────────────────────────────────────────────────────
    // Source of truth: AnalyticsLog. Earlier versions of this endpoint
    // joined Sessions → SessionCodes → Codes, which silently zeroed out
    // whenever those collections were wiped or regenerated (leaving orphan
    // session_codes behind). AnalyticsLog rows are append-only and survive
    // resets, so they give us a stable historical picture. The current
    // Code collection is still used to look up alignment for transmissions
    // and to enumerate the code catalog in the response.
    //
    // Phases: every `system_reset` event (logged by the in-app "Reset
    // Dimension Statistics" admin action and by the initDatabase.js seed
    // script) opens a new phase. Phase N spans [resets[N-1], resets[N]) —
    // end-EXCLUSIVE, so the reset event belongs to the phase it opens and
    // no event is counted in two phases. The newest phase has an open end.
    //
    // Numbering is derived from event ORDER, not from the Phase collection:
    // initDatabase.js wipes Phase docs but preserves AnalyticsLog, so the
    // stored phaseNumber restarts at 1 while resets keep accumulating. The
    // event stream is the only monotonic record of how many phases have run.
    //
    // ?phase= picks the window: a phase number, `current` (the default —
    // this is the pre-phase-selector behaviour), `pre` for anything logged
    // before the very first reset, or `all` for the entire history.
    // ?start_date / ?end_date narrow further and are clamped INTO the
    // selected phase, so narrowing can never reach into a neighbouring one.
    // ──────────────────────────────────────────────────────────────────────
    const TRACKED_EVENT_TYPES = ['session_start', 'code_entered', 'session_finalized', 'code_error_invalid'];

    const resetEvents = await AnalyticsLog.find({ eventType: 'system_reset' })
      .sort({ timestamp: 1 })
      .select('timestamp');

    const phaseWindows = resetEvents.map((reset, i) => ({
      phase_number: i + 1,
      label: `PHASE ${i + 1}`,
      started_at: reset.timestamp,
      ended_at: resetEvents[i + 1] ? resetEvents[i + 1].timestamp : null,
      is_current: i === resetEvents.length - 1
    }));

    // Phase 0 ("PRE-PHASE 1") covers anything logged before the first reset.
    // Gated on events attributable to a CURRENT visitor, not on raw event
    // count: prod's pre-history is 242 events that all belong to retired staff
    // ids or carry a null userId, so every stat below would filter them out
    // and the option would render as an all-zeros phase.
    const firstResetAt = resetEvents.length ? resetEvents[0].timestamp : null;
    const hasPreHistory = firstResetAt
      ? (await AnalyticsLog.countDocuments({
          eventType: { $in: TRACKED_EVENT_TYPES },
          timestamp: { $lt: firstResetAt },
          userId: { $in: Array.from(visitorIds) }
        })) > 0
      : false;

    const selectablePhases = [
      ...(hasPreHistory
        ? [{ phase_number: 0, label: 'PRE-PHASE 1', started_at: null, ended_at: firstResetAt, is_current: false }]
        : []),
      ...phaseWindows
    ];

    // Resolve ?phase=. Unrecognised values fall back to the current phase
    // rather than erroring, so a stale bookmark still renders something.
    const rawPhase = (req.query.phase || '').toString().trim().toLowerCase();
    const currentPhase = phaseWindows.length ? phaseWindows[phaseWindows.length - 1] : null;

    let selectedPhase = null;   // 'all' | 0 | 1..N | null when no reset exists yet
    let phaseStart = null;
    let phaseEnd = null;        // exclusive: it is the NEXT phase's opening reset

    if (rawPhase === 'all') {
      selectedPhase = 'all';
    } else {
      const requestedNumber = rawPhase === 'pre'
        ? 0
        : (/^\d+$/.test(rawPhase) ? Number(rawPhase) : null);
      const chosen =
        (requestedNumber !== null && selectablePhases.find(p => p.phase_number === requestedNumber)) ||
        currentPhase;
      if (chosen) {
        selectedPhase = chosen.phase_number;
        phaseStart = chosen.started_at ? new Date(chosen.started_at) : null;
        phaseEnd = chosen.ended_at ? new Date(chosen.ended_at) : null;
      }
    }

    // Optional caller-supplied narrowing (YYYY-MM-DD, interpreted as UTC),
    // clamped into the selected phase: the start can never reach behind the
    // phase's opening reset, the end never past its closing one. A supplied
    // end is inclusive — it snaps to the last millisecond of the named day,
    // so picking the same date for both yields exactly that one day.
    const parseDateParam = (raw, endOfDay = false) => {
      if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
      const parsed = new Date(raw + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const requestedStart = parseDateParam(req.query.start_date);
    const requestedEnd = parseDateParam(req.query.end_date, true);

    let windowStart = phaseStart;
    if (requestedStart && (!windowStart || requestedStart > windowStart)) {
      windowStart = requestedStart;
    }

    // The phase boundary is exclusive, a caller-supplied end-of-day is not —
    // track which comparison to emit so neither semantic leaks into the other.
    let windowEnd = phaseEnd;
    let windowEndExclusive = phaseEnd !== null;
    if (requestedEnd && (!windowEnd || requestedEnd < windowEnd)) {
      windowEnd = requestedEnd;
      windowEndExclusive = false;
    }

    const eventFilter = { eventType: { $in: TRACKED_EVENT_TYPES } };
    if (windowStart || windowEnd) {
      eventFilter.timestamp = {};
      if (windowStart) eventFilter.timestamp.$gte = windowStart;
      if (windowEnd) eventFilter.timestamp[windowEndExclusive ? '$lt' : '$lte'] = windowEnd;
    }

    const events = await AnalyticsLog.find(eventFilter)
      .select('eventType sessionId userId eventData timestamp')
      .sort({ timestamp: 1 });

    const parseEventData = (e) => {
      try { return e.eventData ? JSON.parse(e.eventData) : {}; }
      catch { return {}; }
    };
    const inferChoice = (data) => {
      if (data.choice === 'a' || data.choice === 'b') return data.choice;
      if (typeof data.alignmentScore === 'number' && data.alignmentScore !== 0) {
        return data.alignmentScore < 0 ? 'a' : 'b';
      }
      return null;
    };

    // Split + keep only what we can attribute to a current visitor. This drops
    // admins, retired staff ids, and legacy rows where userId is null.
    const playerEvents = events.filter(e => e.userId && visitorIds.has(e.userId));
    const startEvents = playerEvents.filter(e => e.eventType === 'session_start');
    const codeEvents = playerEvents.filter(e => e.eventType === 'code_entered');
    const finalizeEvents = playerEvents.filter(e => e.eventType === 'session_finalized');
    // Unrecognized-code attempts (typos, guessed codes, un-seeded codes).
    // Duplicate re-entries of valid codes are logged under different event
    // types and deliberately excluded — a duplicate is a correct code.
    const invalidEvents = playerEvents.filter(e => e.eventType === 'code_error_invalid');

    // Dataset age — days spanned by the window actually queried (the selected
    // phase, narrowed by any caller-supplied dates). If the window has no
    // start — ALL PHASES, PRE-PHASE 1, or a deployment with no reset recorded
    // yet — fall back to the oldest non-admin session_start event so the field
    // still shows something meaningful.
    const ageAnchor = windowStart
      ? new Date(windowStart)
      : (startEvents[0] ? new Date(startEvents[0].timestamp) : null);
    const ageEnd = windowEnd ? windowEnd.getTime() : Date.now();
    const datasetAgeDays = ageAnchor
      ? Math.max(0, Math.floor((ageEnd - ageAnchor.getTime()) / 86400000))
      : 0;

    // Per-user stats. login_count = number of session_start events. codes_used =
    // unique code texts from the user's code_entered events.
    const userStats = {};
    const ensureUser = (uid) => {
      if (!userStats[uid]) userStats[uid] = { user_id: uid, login_count: 0, codes: new Set(), invalidCodes: new Set() };
      return userStats[uid];
    };
    for (const e of startEvents) ensureUser(e.userId).login_count += 1;
    for (const e of codeEvents) {
      const data = parseEventData(e);
      if (data.code) ensureUser(e.userId).codes.add(data.code);
    }
    // Count DISTINCT invalid code strings per user, mirroring codes_used_count
    // for valid codes — how many different unrecognized codes they tried, not
    // how many times they fumbled. Uppercased to match the write-path
    // normalization and to fold any legacy mixed-case rows together.
    for (const e of invalidEvents) {
      const codeText = (parseEventData(e).code || '').toUpperCase().trim();
      if (codeText) ensureUser(e.userId).invalidCodes.add(codeText);
    }
    const users = Object.values(userStats)
      .filter(u => u.login_count > 0)
      .map(u => ({
        user_id: u.user_id,
        login_count: u.login_count,
        codes_used_count: u.codes.size,
        invalid_codes_count: u.invalidCodes.size
      }));
    const totalNonAdminUsers = users.length;

    // Map sessionId → final choice for any finalized session (used for
    // transmissions). Built from finalize events so orphaned/wiped Sessions
    // don't drop these rows.
    const sessionChoiceMap = new Map();
    for (const e of finalizeEvents) {
      if (!e.sessionId) continue;
      sessionChoiceMap.set(e.sessionId.toString(), inferChoice(parseEventData(e)));
    }

    // Per-code stats — aggregated by code TEXT (not ObjectId), since codeIds
    // get regenerated on reseed. Codes that no longer exist in the catalog
    // still contribute to activations/users but won't get transmissions
    // because we can't resolve their alignment.
    const allCodes = await Code.find().select('code alignment');
    const alignByCode = Object.fromEntries(allCodes.map(c => [c.code, c.alignment]));

    const codeBucket = {};
    for (const e of codeEvents) {
      const data = parseEventData(e);
      const codeText = data.code;
      if (!codeText) continue;
      if (!codeBucket[codeText]) {
        codeBucket[codeText] = { activations: 0, transmissions: 0, users: new Set() };
      }
      const b = codeBucket[codeText];
      b.activations += 1;
      b.users.add(e.userId);

      const choice = e.sessionId ? sessionChoiceMap.get(e.sessionId.toString()) : null;
      const align = alignByCode[codeText];
      if (choice && align) {
        const matches =
          (align === 'PHAX' && choice === 'a') ||
          (align === 'FHEELS' && choice === 'b') ||
          align === 'SIGSEV';
        if (matches) b.transmissions += 1;
      }
    }

    // Emit one row per code in the current catalog.
    const codes = allCodes.map(c => {
      const b = codeBucket[c.code];
      const userCount = b ? b.users.size : 0;
      return {
        code: c.code,
        activations: b?.activations || 0,
        transmissions: b?.transmissions || 0,
        user_percentage: totalNonAdminUsers > 0 ? (userCount / totalNonAdminUsers) * 100 : 0
      };
    });

    // Choice popularity — each non-admin user contributes once, by their
    // most recent finalized choice. Falls back to alignmentScore sign when
    // the event didn't carry an explicit choice field (pre-fix events).
    const mostRecentFinalizeByUser = {};
    for (const e of finalizeEvents) {
      const cur = mostRecentFinalizeByUser[e.userId];
      if (!cur || new Date(e.timestamp) > new Date(cur.timestamp)) {
        mostRecentFinalizeByUser[e.userId] = e;
      }
    }
    let containmentUsers = 0;
    let proliferationUsers = 0;
    for (const e of Object.values(mostRecentFinalizeByUser)) {
      const choice = inferChoice(parseEventData(e));
      if (choice === 'a') containmentUsers += 1;
      else if (choice === 'b') proliferationUsers += 1;
    }
    const choiceUserTotal = containmentUsers + proliferationUsers;
    const choiceDistribution = {
      containment_count: containmentUsers,
      proliferation_count: proliferationUsers,
      total_users: choiceUserTotal,
      containment_pct: choiceUserTotal > 0 ? (containmentUsers / choiceUserTotal) * 100 : 0,
      proliferation_pct: choiceUserTotal > 0 ? (proliferationUsers / choiceUserTotal) * 100 : 0
    };

    // Invalid-code frequency — aggregated by the attempted string. Uppercased
    // defensively so legacy rows written before the write-path normalization
    // still bucket alongside newer ones. Returned fully ranked; the client
    // slices to a top 10.
    const invalidBucket = {};
    let totalInvalidAttempts = 0;
    for (const e of invalidEvents) {
      const codeText = (parseEventData(e).code || '').toUpperCase().trim();
      if (!codeText) continue;
      totalInvalidAttempts += 1;
      if (!invalidBucket[codeText]) invalidBucket[codeText] = { attempts: 0, users: new Set() };
      invalidBucket[codeText].attempts += 1;
      invalidBucket[codeText].users.add(e.userId);
    }
    const invalidCodes = Object.entries(invalidBucket)
      .map(([code, b]) => ({ code, attempts: b.attempts, user_count: b.users.size }))
      .sort((a, b) => b.attempts - a.attempts);

    res.json({
      success: true,
      analytics: {
        // `phases` drives the phase selector, oldest first. `selected_phase`
        // echoes what this response was actually built from ('all', 0 for
        // PRE-PHASE 1, or a phase number; null on a deployment with no reset
        // recorded yet). `phase_start_date` / `phase_end_date` are the bounds
        // of that phase and become the date picker's min/max — null means
        // open-ended (the current phase has no end; ALL PHASES has neither).
        // `effective_*` is the window actually queried after the date pickers
        // narrowed it. `reset_date` is retained for older clients and is the
        // most recent reset, i.e. the current phase's start. All ISO strings.
        phases: selectablePhases.map(p => ({
          phase_number: p.phase_number,
          label: p.label,
          started_at: p.started_at ? new Date(p.started_at).toISOString() : null,
          ended_at: p.ended_at ? new Date(p.ended_at).toISOString() : null,
          is_current: p.is_current
        })),
        selected_phase: selectedPhase,
        phase_start_date: phaseStart ? phaseStart.toISOString() : null,
        phase_end_date: phaseEnd ? phaseEnd.toISOString() : null,
        reset_date: currentPhase ? new Date(currentPhase.started_at).toISOString() : null,
        effective_start_date: windowStart ? new Date(windowStart).toISOString() : null,
        effective_end_date: windowEnd ? new Date(windowEnd).toISOString() : null,
        dataset_age_days: datasetAgeDays,
        total_non_admin_users: totalNonAdminUsers,
        choice_distribution: choiceDistribution,
        total_invalid_attempts: totalInvalidAttempts,
        users,
        codes,
        invalid_codes: invalidCodes
      }
    });

  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error fetching detailed analytics' });
  }
});

// GET /api/admin/users - Get all user IDs alphabetically (admin only)
app.get('/api/admin/users', async (req, res) => {
  try {
    const { session_token } = req.query;

    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({ success: false, error: 'INVALID_SESSION', message: 'Session not found' });
    }

    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'Admin access required' });
    }

    const users = await UserId.find().sort({ userId: 1 });

    // Determine used vs unused: a user is "used" if they have any session
    // with codes entered or an email address assigned
    const sessions = await Session.find({
      $or: [
        { totalCodesEntered: { $gt: 0 } },
        { emailAddress: { $exists: true, $ne: null, $ne: '' } }
      ]
    });
    const usedUserIds = new Set(sessions.map(s => s.userId));

    res.json({
      success: true,
      users: users.map(u => ({
        user_id: u.userId,
        is_admin: u.isAdmin,
        last_used: u.lastUsedDate,
        usage_count: u.usageCount,
        has_activity: u.isAdmin || usedUserIds.has(u.userId)
      }))
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error fetching users' });
  }
});

// GET /api/admin/codes - Get all codes with their effects (admin only)
app.get('/api/admin/codes', async (req, res) => {
  try {
    const { session_token } = req.query;

    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({ success: false, error: 'INVALID_SESSION', message: 'Session not found' });
    }

    const adminUser = await UserId.findOne({ userId: session.userId });
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'Admin access required' });
    }

    const codes = await Code.find().sort({ tier: 1, code: 1 });
    const effects = await CodeEffect.find().populate('universeId', 'name');

    // Group effects by code ID
    const effectsByCode = {};
    for (const effect of effects) {
      const codeId = effect.codeId.toString();
      if (!effectsByCode[codeId]) effectsByCode[codeId] = [];
      effectsByCode[codeId].push({
        universe: effect.targetMode === 'all' ? 'ALL' : effect.targetMode === 'random' ? 'RANDOM' : (effect.universeId?.name || 'Unknown'),
        effect_value: effect.effectValue,
        effect_type: effect.effectType,
        is_post_cure: effect.isPostCure
      });
    }

    res.json({
      success: true,
      codes: codes.map(c => ({
        code: c.code,
        name: c.name,
        tier: c.tier,
        alignment: c.alignment,
        description: c.description,
        is_cure_code: c.isCureCode,
        is_active: c.isActive,
        effects: effectsByCode[c._id.toString()] || []
      }))
    });

  } catch (error) {
    console.error('Error fetching codes:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error fetching codes' });
  }
});

// GET /api/admin/settings/effect-scale - Get current effect scale (admin only)
app.get('/api/admin/settings/effect-scale', async (req, res) => {
  try {
    const { session_token } = req.query;
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    const userIdRecord = await UserId.findOne({ userId: session.userId });
    if (!userIdRecord || !userIdRecord.isAdmin) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Admin access required' });
    }

    const settings = await AdminSettings.getSettings();
    res.json({ success: true, effectScale: settings.effectScale });
  } catch (error) {
    console.error('Error getting effect scale:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error getting effect scale' });
  }
});

// POST /api/admin/settings/effect-scale - Set effect scale (admin only)
app.post('/api/admin/settings/effect-scale', async (req, res) => {
  try {
    const { session_token, effectScale } = req.body;
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    const userIdRecord = await UserId.findOne({ userId: session.userId });
    if (!userIdRecord || !userIdRecord.isAdmin) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Admin access required' });
    }

    const value = parseInt(effectScale, 10);
    if (isNaN(value) || value < 1 || value > 99) {
      return res.status(400).json({ success: false, error: 'INVALID_VALUE', message: 'Effect scale must be between 1 and 99' });
    }

    const settings = await AdminSettings.getSettings();
    const previousScale = settings.effectScale;
    settings.effectScale = value;
    await settings.save();

    // effectScale multiplies every standard effect at runtime, so it is the
    // single largest determinant of how far a session moved the board. Without
    // this event no historical alignmentScore can be interpreted after the
    // fact. AnalyticsLog is never wiped by initDatabase.js or by the universe
    // reset, so these rows are permanent history. The admin UI is a stepper
    // and fires no-op writes, so only log an actual change.
    if (previousScale !== value) {
      await logEvent('effect_scale_changed', session._id, session.userId, {
        from: previousScale,
        to: value
      });
    }

    res.json({ success: true, effectScale: settings.effectScale });
  } catch (error) {
    console.error('Error setting effect scale:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Error setting effect scale' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
