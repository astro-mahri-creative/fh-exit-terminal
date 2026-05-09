const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid initialized');
} else {
  console.warn('SENDGRID_API_KEY not set — emails will be logged only');
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
  if (currentCases >= initializationCases * 0.85) return 'LIBERATED';
  if (currentCases <= initializationCases * 0.15) return 'PRESERVED';
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

// Select a random universe with COMPROMISED status and >0 cases
function selectRandomCompromised(universes) {
  const eligible = universes.filter(u => u.currentCases > 0 && u.status === 'COMPROMISED');
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
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

  if (statusCounts.LIBERATED > 3) {
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

        // Resume existing session (complete or not)
        return res.json({
          success: true,
          session_token: existingSession.sessionToken,
          session_id: existingSession._id,
          user_id: user_id.toLowerCase(),
          is_admin: userIdRecord.isAdmin,
          resumed: true,
          message: 'Session resumed'
        });
      }
    }

    // Update user ID usage
    userIdRecord.lastUsedDate = new Date();
    userIdRecord.usageCount += 1;
    await userIdRecord.save();

    // Create session
    const sessionToken = `sess_${uuidv4()}`;
    const session = await Session.create({
      userId: user_id.toLowerCase(),
      sessionToken
    });

    await logEvent('session_start', session._id, user_id.toLowerCase());

    res.json({
      success: true,
      session_token: sessionToken,
      session_id: session._id,
      user_id: user_id.toLowerCase(),
      is_admin: userIdRecord.isAdmin,
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

// GET /api/network - Universe network data (public)
app.get('/api/network', async (req, res) => {
  try {
    const universes = await Universe.find().sort({ displayOrder: 1 });
    res.json({ success: true, universes, edges: [] });
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
      await logEvent('code_error_invalid', session._id, session.userId, { code });
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
    const sessionCodes = await SessionCode.find(codesQuery).populate('codeId');

    if (sessionCodes.length === 0) {
      return res.status(400).json({ success: false, error: 'NO_CODES_ENTERED', message: 'Please enter at least one code' });
    }
    const universes = await Universe.find();
    let cureStatus = await CureStatus.findOne();
    let isCureActive = cureStatus?.isDiscovered || false;

    const { tierMultipliers, bonusEffects, triggerCure } = await applyMetaGameRules(sessionCodes, universes);
    if (triggerCure && !isCureActive) isCureActive = true;

    const settings = await AdminSettings.getSettings();
    const effectScale = settings.effectScale || 1;

    // Work on in-memory copies for status tracking during preview
    const simUniverses = universes.map(u => ({
      _id: u._id,
      name: u.name,
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
    const excludedUniverseIds = new Set();

    // --- Pass 1: process status-breaking codes (RVLT/CURE) first ---
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;

        if (effect.effectType === 'break_preserved') {
          const preserved = simUniverses.filter(u => u.status === 'PRESERVED');
          if (preserved.length === 0) {
            previewStatusMessages.push({ code: code.code, message: '???' });
            continue;
          }
          const target = preserved[Math.floor(Math.random() * preserved.length)];
          const newCases = Math.ceil(target.initializationCases * 0.25);
          target.currentCases = newCases;
          target.status = calculateUniverseStatus(newCases, target.initializationCases);
          excludedUniverseIds.add(target._id.toString());
          previewStatusMessages.push({ code: code.code, message: '???' });
          continue;
        }
        if (effect.effectType === 'break_liberated') {
          const liberated = simUniverses.filter(u => u.status === 'LIBERATED');
          if (liberated.length === 0) {
            previewStatusMessages.push({ code: code.code, message: '???' });
            continue;
          }
          const target = liberated[Math.floor(Math.random() * liberated.length)];
          const newCases = Math.floor(target.initializationCases * 0.75);
          target.currentCases = newCases;
          target.status = calculateUniverseStatus(newCases, target.initializationCases);
          excludedUniverseIds.add(target._id.toString());
          previewStatusMessages.push({ code: code.code, message: '???' });
          continue;
        }
      }
    }

    // --- Pass 2: process all standard numerical effects ---
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

        // Resolve random target (excluding RVLT/CURE universes)
        let targetUniverse;
        if (effect.targetMode === 'random') {
          targetUniverse = selectRandomCompromised(simUniverses.filter(u => !excludedUniverseIds.has(u._id.toString())));
          if (!targetUniverse) continue;
        } else {
          targetUniverse = simUniverses.find(u => u._id.equals(effect.universeId));
          if (targetUniverse && excludedUniverseIds.has(targetUniverse._id.toString())) continue;
        }
        if (!targetUniverse) continue;

        // Status-based blocking
        if (targetUniverse.status === 'LIBERATED') continue;
        if (targetUniverse.status === 'PRESERVED' && effectValue > 0) continue;

        const universeId = targetUniverse._id.toString();
        if (effectValue < 0 && negativeChanges[universeId]) {
          negativeChanges[universeId].change += effectValue;
        } else if (effectValue > 0 && positiveChanges[universeId]) {
          positiveChanges[universeId].change += effectValue;
        }

        // Update sim state
        const previousStatus = targetUniverse.status;
        targetUniverse.currentCases = Math.max(0, targetUniverse.currentCases + effectValue);
        targetUniverse.status = calculateUniverseStatus(targetUniverse.currentCases, targetUniverse.initializationCases);

        if (targetUniverse.status !== previousStatus) {
          previewStatusMessages.push({ code: code.code, message: `STATUS of ${targetUniverse.name} is now ${targetUniverse.status}` });
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

    res.json({
      success: true,
      option_a: {
        label: 'iFLU CONTAINMENT PROTOCOL',
        description: 'Apply infection reduction effects',
        universes: Object.values(negativeChanges).map(u => ({
          ...u,
          projected_cases: Math.max(0, u.current_cases + u.change)
        })),
        net_change: netNegative
      },
      option_b: {
        label: 'iFLU PROLIFERATION PROTOCOL',
        description: 'Apply infection increase effects',
        universes: Object.values(positiveChanges).map(u => ({
          ...u,
          projected_cases: Math.max(0, u.current_cases + u.change)
        })),
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
    const sessionCodes = await SessionCode.find(codesQuery).populate('codeId');

    if (sessionCodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_CODES_ENTERED',
        message: 'Please enter at least one code'
      });
    }

    // Get cure status
    let cureStatus = await CureStatus.findOne();
    let isCureActive = cureStatus?.isDiscovered || false;

    // Get all universes
    const universes = await Universe.find();
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
      currentCases: u.currentCases,
      initializationCases: u.initializationCases,
      status: u.status
    }));

    const statusMessages = [];
    const excludedUniverseIds = new Set();

    // --- Pass 1: process status-breaking codes (RVLT/CURE) first ---
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      const effects = await CodeEffect.find({ codeId: code._id });

      for (const effect of effects) {
        if (effect.isPostCure && !isCureActive) continue;

        if (effect.effectType === 'break_preserved') {
          const preserved = liveUniverses.filter(u => u.status === 'PRESERVED');
          if (preserved.length === 0) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          const target = preserved[Math.floor(Math.random() * preserved.length)];
          const newCases = Math.ceil(target.initializationCases * 0.25);
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
          const liberated = liveUniverses.filter(u => u.status === 'LIBERATED');
          if (liberated.length === 0) {
            statusMessages.push({ code: code.code, message: 'NO IMPACT' });
            continue;
          }
          const target = liberated[Math.floor(Math.random() * liberated.length)];
          const newCases = Math.floor(target.initializationCases * 0.75);
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

        // Resolve target universe (excluding RVLT/CURE universes)
        let targetUniverse;
        if (effect.targetMode === 'random') {
          targetUniverse = selectRandomCompromised(liveUniverses.filter(u => !excludedUniverseIds.has(u._id.toString())));
          if (!targetUniverse) continue;
        } else {
          targetUniverse = liveUniverses.find(u => u._id.equals(effect.universeId));
          if (targetUniverse && excludedUniverseIds.has(targetUniverse._id.toString())) continue;
        }
        if (!targetUniverse) continue;

        // Status-based blocking
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
      alignmentScore: totalAlignmentScore
    });

    const totalAvailableCodes = await Code.countDocuments({ isActive: true });

    res.json({
      success: true,
      universes: updatedUniverses.map(u => ({
        id: u._id,
        name: u.name,
        current_cases: u.currentCases,
        previous_cases: universeChanges[u._id.toString()]?.previousCases || u.currentCases,
        status: u.status,
        change: universeChanges[u._id.toString()]?.change || 0
      })),
      phax_alert: phaxAlert,
      alignment_narrative: alignmentNarrative,
      alignment_score: totalAlignmentScore,
      total_codes_entered: session.totalCodesEntered,
      total_codes: totalAvailableCodes,
      cure_active: isCureActive,
      status_messages: statusMessages
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
    const { session_token, email } = req.body;
    
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
    
    // Get session codes
    const sessionCodes = await SessionCode.find({ sessionId: session._id })
      .populate('codeId')
      .sort({ sequenceOrder: 1 });
    
    const codes = sessionCodes.map(sc => sc.codeId.code).join(', ');
    const alignmentNarrative = generateAlignmentNarrative(session.alignmentScore, session.totalCodesEntered);

    // Get universe data for the report
    const universes = await Universe.find().sort({ displayOrder: 1 });

    // Build email HTML
    const universeRows = universes.map(u => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#f0eeeb;font-family:monospace;">${u.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#f0eeeb;text-align:right;font-family:monospace;">${u.currentCases.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#9e9e9e;text-align:center;font-family:monospace;font-size:12px;">${u.status}</td>
      </tr>
    `).join('');

    const scoreColor = session.alignmentScore < 0 ? '#aac4ff' : session.alignmentScore > 0 ? '#8fcc88' : '#9e9e9e';

    const htmlContent = `
    <div style="background:#060606;padding:32px;font-family:'Courier New',monospace;color:#f0eeeb;max-width:600px;margin:0 auto;">
      <div style="border-bottom:1px solid #2a2a2a;padding-bottom:16px;margin-bottom:24px;">
        <h1 style="font-size:14px;letter-spacing:0.3em;color:#aac4ff;margin:0;">PHAX TERMINAL REPORT</h1>
        <p style="font-size:11px;color:#777;margin:4px 0 0;letter-spacing:0.15em;">FUTURE HOOMAN EXIT TERMINAL</p>
      </div>

      <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;padding:20px;margin-bottom:20px;">
        <p style="font-size:11px;color:#777;letter-spacing:0.15em;margin:0 0 8px;">ALIGNMENT NARRATIVE</p>
        <p style="font-size:14px;line-height:1.7;color:#f0eeeb;margin:0;">${alignmentNarrative}</p>
      </div>

      <div style="display:flex;gap:24px;margin-bottom:20px;">
        <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;padding:16px;flex:1;text-align:center;">
          <p style="font-size:10px;color:#777;letter-spacing:0.12em;margin:0 0 6px;">CODES ENTERED</p>
          <p style="font-size:28px;font-weight:bold;color:#f0eeeb;margin:0;">${session.totalCodesEntered}</p>
        </div>
        <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;padding:16px;flex:1;text-align:center;">
          <p style="font-size:10px;color:#777;letter-spacing:0.12em;margin:0 0 6px;">ALIGNMENT SCORE</p>
          <p style="font-size:28px;font-weight:bold;color:${scoreColor};margin:0;">${session.alignmentScore > 0 ? '+' : ''}${session.alignmentScore}</p>
        </div>
      </div>

      <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;padding:16px;margin-bottom:20px;">
        <p style="font-size:10px;color:#777;letter-spacing:0.12em;margin:0 0 6px;">YOUR CODES</p>
        <p style="font-size:14px;color:#aac4ff;letter-spacing:0.1em;margin:0;">${codes}</p>
      </div>

      <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;overflow:hidden;margin-bottom:20px;">
        <p style="font-size:10px;color:#777;letter-spacing:0.12em;padding:12px 12px 8px;margin:0;">DIMENSIONAL NETWORK STATUS</p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #3d3d3d;">
              <th style="padding:6px 12px;text-align:left;font-size:10px;color:#444;letter-spacing:0.1em;">UNIVERSE</th>
              <th style="padding:6px 12px;text-align:right;font-size:10px;color:#444;letter-spacing:0.1em;">CASES</th>
              <th style="padding:6px 12px;text-align:center;font-size:10px;color:#444;letter-spacing:0.1em;">STATUS</th>
            </tr>
          </thead>
          <tbody>${universeRows}</tbody>
        </table>
      </div>

      <div style="border-top:1px solid #2a2a2a;padding-top:16px;text-align:center;">
        <p style="font-size:10px;color:#444;letter-spacing:0.1em;margin:0;">FUTURE HOOMAN &mdash; PHAX DIMENSIONAL NETWORK</p>
      </div>
    </div>
    `;

    // Send email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      const msg = {
        to: email,
        from: {
          email: process.env.EMAIL_FROM || 'team@futurehooman.com',
          name: 'PHAX Terminal'
        },
        subject: `Your Exit Terminal Impact Report — Score: ${session.alignmentScore > 0 ? '+' : ''}${session.alignmentScore}`,
        html: htmlContent
      };

      await sgMail.send(msg);
      console.log('Email sent to:', email);
    } else {
      console.log('SendGrid not configured — email logged only');
      console.log('Would send to:', email);
    }

    // Update session
    session.emailAddress = email;
    session.emailSent = true;
    await session.save();

    await logEvent('email_sent', session._id, session.userId, { email });

    res.json({
      success: true,
      message: 'Impact report sent successfully'
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error sending email'
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
    
    // Generate unique user ID
    let newUserId;
    let attempts = 0;
    
    while (attempts < 10) {
      newUserId = Math.random().toString(36).substring(2, 8).toLowerCase();
      const exists = await UserId.findOne({ userId: newUserId });
      if (!exists) break;
      attempts++;
    }
    
    if (attempts >= 10) {
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
    settings.sameDayReturnMode = settings.sameDayReturnMode === 'resume' ? 'block' : 'resume';
    await settings.save();

    res.json({ success: true, sameDayReturnMode: settings.sameDayReturnMode });
  } catch (error) {
    console.error('Error toggling return mode:', error);
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
    
    // Reset all universes to 50% of init cases
    const universes = await Universe.find();
    for (const universe of universes) {
      universe.currentCases = Math.floor(universe.initializationCases * 0.5);
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
    
    // Reset user ID usage
    await UserId.updateMany({}, { lastUsedDate: null });
    
    await logEvent('system_reset', session._id, session.userId);
    
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
        effectScale: settings.effectScale
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
    settings.effectScale = value;
    await settings.save();

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
