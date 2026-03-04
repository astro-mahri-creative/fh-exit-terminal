const mongoose = require('mongoose');

// Universe Schema
const universeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayOrder: { type: Number, required: true },
  initializationCases: { type: Number, required: true },
  currentCases: { type: Number, required: true },
  status: { type: String, required: true, default: 'ACTIVE' },
  canSpread: { type: Boolean, default: true },
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
  alignment: { type: String, required: true, enum: ['PHAX', 'FHEELS'] },
  isCureCode: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Code Effect Schema
const codeEffectSchema = new mongoose.Schema({
  codeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Code', required: true },
  universeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Universe', required: true },
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
  emailAddress: { type: String },
  emailSent: { type: Boolean, default: false },
  isComplete: { type: Boolean, default: false }
});

// Session Code Schema
const sessionCodeSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  codeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Code', required: true },
  enteredAt: { type: Date, default: Date.now },
  sequenceOrder: { type: Number, required: true }
});

// User ID Schema
const userIdSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  isAdmin: { type: Boolean, default: false },
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

// Analytics Log Schema
const analyticsLogSchema = new mongoose.Schema({
  eventType: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  userId: { type: String },
  eventData: { type: String },
  timestamp: { type: Date, default: Date.now }
});

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
  AnalyticsLog
};
