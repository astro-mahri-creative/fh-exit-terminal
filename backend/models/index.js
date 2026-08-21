const mongoose = require('mongoose');

// Universe Schema
const universeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayOrder: { type: Number, required: true },
  initializationCases: { type: Number, required: true },
  // Snapshot of currentCases at the moment this universe was created by
  // the init script. Used by the admin "Reset Dimension Statistics"
  // action to restore the exact spread defined in initDatabase.js
  // (instead of a uniform 50%).
  initialCurrentCases: { type: Number },
  currentCases: { type: Number, required: true },
  status: { type: String, required: true, default: 'COMPROMISED' },
  canSpread: { type: Boolean, default: true },
  lastImpactDirection: { type: String, enum: ['positive', 'negative', null], default: null },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Universe Status Threshold Schema
const universeStatusThresholdSchema = new mongoose.Schema({
  statusName: { type: String, required: true, unique: true },
  minCases: { type: Number, default: null },
  maxCases: { type: Number, default: null },
  canSpread: { type: Boolean, default: true },
  description: { type: String },
  colorPrimary: { type: String },
  colorSecondary: { type: String }
});

// Code Schema
const codeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  tier: { type: Number, required: true, min: 1, max: 6 },
  name: { type: String },
  description: { type: String },
  alignment: { type: String, required: true, enum: ['PHAX', 'FHEELS', 'SIGSEV'] },
  isCureCode: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Code Effect Schema
const codeEffectSchema = new mongoose.Schema({
  codeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Code', required: true },
  universeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Universe', default: null },
  // 'nearest_goal' / 'furthest_goal' resolve their target deterministically
  // from the eligible pool by relative case count, sign-driven (see
  // selectByGoalProximity in server.js). Meaningful only on 'standard'
  // effects — 'amplify' rows never reach target resolution.
  targetMode: {
    type: String,
    enum: ['specific', 'random', 'all', 'nearest_goal', 'furthest_goal'],
    default: 'specific'
  },
  effectValue: { type: Number, required: true },
  effectType: { type: String, default: 'standard' },
  conditionRule: { type: String },
  isPostCure: { type: Boolean, default: false }
}, { timestamps: true });

// Session Schema
const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  sessionToken: { type: String, required: true, unique: true },
  startedAt: { type: Date, default: Date.now },
  finalizedAt: { type: Date },
  totalCodesEntered: { type: Number, default: 0 },
  alignmentScore: { type: Number, default: 0 },
  // Which option the user picked at the choice screen on finalize.
  // 'a' = containment (negative effects applied), 'b' = proliferation
  // (positive effects applied). Null on sessions that predate this field
  // or were never finalized.
  choice: { type: String, enum: ['a', 'b', null], default: null },
  emailAddress: { type: String },
  emailSent: { type: Boolean, default: false },
  optInMessaging: { type: Boolean, default: false },
  isComplete: { type: Boolean, default: false }
});

// Session Code Schema
const sessionCodeSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  codeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Code', required: true },
  enteredAt: { type: Date, default: Date.now },
  sequenceOrder: { type: Number, required: true },
  // Which universe each randomly-targeted effect of this activation landed
  // on. Written once, by whichever path resolves the effect first (normally
  // preview); every later read — repeat previews, then finalize — reuses it.
  // Without this the preview and finalize paths each rolled Math.random()
  // independently and disagreed about the target. One entry per CodeEffect,
  // since a single code can carry several (TPGM and FAES both do).
  resolvedTargets: [{
    _id: false,
    effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodeEffect', required: true },
    universeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Universe', required: true }
  }]
});

// User ID Schema
const userIdSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  isAdmin: { type: Boolean, default: false },
  // Email captured during the "Save Progress?" step on the code entry screen.
  // Lives here (rather than only on Session) so it survives across sessions and
  // can pre-populate the impact report on the user's next visit.
  emailAddress: { type: String },
  // Consent to receive Future Hooman news/events mail, captured beside the
  // email at the same gate. Mirrored onto Session for per-visit auditing;
  // this copy is the one a mailing-list export should read, since it survives
  // across sessions with the address it belongs to.
  optInMessaging: { type: Boolean, default: false },
  optInAt: { type: Date },
  lastUsedDate: { type: Date },
  usageCount: { type: Number, default: 0 }
}, { timestamps: true });

// Phase Schema
const phaseSchema = new mongoose.Schema({
  phaseNumber: { type: Number, required: true },
  phaseName: { type: String },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  phaseLengthHours: { type: Number },
  isActive: { type: Boolean, default: true },
  narrativeDescription: { type: String }
});

// Meta Game Rule Schema
const metaGameRuleSchema = new mongoose.Schema({
  ruleName: { type: String, required: true },
  conditionType: { type: String, required: true },
  conditionDefinition: { type: String, required: true },
  effectDefinition: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 0 }
}, { timestamps: true });

// PHAX Alert Message Schema
const phaxAlertMessageSchema = new mongoose.Schema({
  messageText: { type: String, required: true },
  triggerCondition: { type: String, required: true },
  priority: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Cure Status Schema
const cureStatusSchema = new mongoose.Schema({
  isDiscovered: { type: Boolean, default: false },
  discoveredAt: { type: Date },
  discoveredBySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  cureTriggerType: { type: String },
  phaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Phase' }
});

// Final State Event Schema
//
// One row per time the network reaches its terminal configuration: every
// universe locked into a permanent status (TRANSCENDED at zero cases or
// QUARANTINED at full saturation — the two statuses that clear canSpread and
// that ordinary random-target codes can no longer reach, since target
// selection only ever considers COMPROMISED universes).
//
// Written at most once per phase. The unique index on phaseNumber is what
// makes alert dispatch idempotent: a later transmission that leaves the board
// still-final cannot fire a second round of notifications. Resetting dimension
// statistics opens a new phase, which re-arms detection.
const finalStateEventSchema = new mongoose.Schema({
  phaseNumber: { type: Number, required: true },
  detectedAt: { type: Date, default: Date.now },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  userId: { type: String },
  // Snapshot of the board at the moment it locked, so the alert — and any
  // later forensics — doesn't depend on the universes still being untouched.
  snapshot: [{
    _id: false,
    name: String,
    status: String,
    currentCases: Number,
    initializationCases: Number
  }],
  // Per-channel dispatch outcome, one entry per configured channel.
  notifications: [{
    _id: false,
    channel: String,
    ok: Boolean,
    detail: String,
    at: { type: Date, default: Date.now }
  }],
  dispatched: { type: Boolean, default: false }
}, { timestamps: true });
finalStateEventSchema.index({ phaseNumber: 1 }, { unique: true });

// Analytics Log Schema
const analyticsLogSchema = new mongoose.Schema({
  eventType: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  userId: { type: String },
  eventData: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Admin Settings Schema (singleton document)
const adminSettingsSchema = new mongoose.Schema({
  sameDayReturnMode: { type: String, enum: ['resume', 'block'], default: 'resume' },
  effectScale: { type: Number, default: 1, min: 1, max: 99 },
  // When true, non-admin users can neither log in nor mint a new user ID.
  // Toggled by hand from the admin panel; admins are always exempt.
  terminalLocked: { type: Boolean, default: false },
  // Whether finalize automatically emails the impact report to visitors who
  // already have an address on file. Off is a real operating mode, not just a
  // kill switch: during a busy exhibit day it keeps the results screen from
  // waiting on a mail provider, and it protects a limited daily send quota.
  // Turning it off does NOT disable the button on the results screen — a
  // visitor who explicitly asks for their report still gets it.
  autoSendImpactReport: { type: Boolean, default: true }
});
adminSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

// Create models
const Universe = mongoose.model('Universe', universeSchema);
const UniverseStatusThreshold = mongoose.model('UniverseStatusThreshold', universeStatusThresholdSchema);
const Code = mongoose.model('Code', codeSchema);
const CodeEffect = mongoose.model('CodeEffect', codeEffectSchema);
const Session = mongoose.model('Session', sessionSchema);
const SessionCode = mongoose.model('SessionCode', sessionCodeSchema);
const UserId = mongoose.model('UserId', userIdSchema);
const Phase = mongoose.model('Phase', phaseSchema);
const MetaGameRule = mongoose.model('MetaGameRule', metaGameRuleSchema);
const PhaxAlertMessage = mongoose.model('PhaxAlertMessage', phaxAlertMessageSchema);
const CureStatus = mongoose.model('CureStatus', cureStatusSchema);
const AnalyticsLog = mongoose.model('AnalyticsLog', analyticsLogSchema);
const FinalStateEvent = mongoose.model('FinalStateEvent', finalStateEventSchema);
const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

module.exports = {
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
  AdminSettings,
  FinalStateEvent
};
