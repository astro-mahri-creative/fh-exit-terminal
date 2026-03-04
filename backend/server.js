require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

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
  AnalyticsLog
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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// ==================== UTILITY FUNCTIONS ====================

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

// Calculate universe status based on case count
async function calculateUniverseStatus(currentCases) {
  const thresholds = await UniverseStatusThreshold.find().sort({ minCases: 1 });
  
  // Special case checks first
  if (currentCases >= 150000) return 'LIBERATED';
  if (currentCases >= 90000) return 'COMPROMISED';
  if (currentCases >= 1000 && currentCases <= 75000) return 'ACTIVE';
  if (currentCases <= 500) return 'OPTIMIZED';
  
  // Default to ACTIVE
  return 'ACTIVE';
}

// Update universe status and canSpread
async function updateUniverseStatus(universeId) {
  const universe = await Universe.findById(universeId);
  if (!universe) return;
  
  const newStatus = await calculateUniverseStatus(universe.currentCases);
  
  // Update canSpread based on status
  let canSpread = true;
  if (['OPTIMIZED', 'QUARANTINED', 'LIBERATED'].includes(newStatus)) {
    canSpread = false;
  }
  
  universe.status = newStatus;
  universe.canSpread = canSpread;
  universe.lastUpdated = new Date();
  await universe.save();
  
  return universe;
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
  
  if (statusCounts.LIBERATED > 0) {
    condition = 'liberated_states';
  } else if (statusCounts.QUARANTINED > 0) {
    condition = 'quarantined_states';
  } else if (cureStatus?.isDiscovered) {
    condition = 'cure_discovery';
  } else if (statusCounts.OPTIMIZED >= 5) {
    condition = 'optimized_states';
  } else if (statusCounts.COMPROMISED > 0) {
    condition = 'compromised_states';
  } else if (totalCases > 800000) {
    condition = 'extreme_fheels_victory';
  } else if (totalCases < 50000) {
    condition = 'optimized_states';
  } else if (Object.keys(statusCounts).length > 2) {
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
      "Your terminal codes have significantly reinforced PHAX containment protocols. Multiple dimensions show marked improvement in iFLU suppression. The system commends your contribution to stability.",
      "Exceptional containment performance detected. Your code sequence has optimized dimensional stability across the network. PHAX operations enhanced."
    ],
    moderatePhax: [
      "Your codes have strengthened PHAX technological protocols. iFLU containment showing measurable improvement. System efficiency increased.",
      "Containment protocols activated successfully. Your terminal sequence supports PHAX dimensional management objectives."
    ],
    slightPhax: [
      "Minor PHAX protocol enhancement detected. Your codes contribute to system stability. Containment operations proceeding normally.",
      "Your terminal codes align with standard PHAX containment measures. Modest dimensional stabilization achieved."
    ],
    neutral: [
      "Your code sequence shows balanced impact. No significant alignment detected. Dimensional network status unchanged.",
      "Neutral terminal code configuration. PHAX and alternative systems equally affected. Network stability maintained."
    ],
    slightFheels: [
      "Warning: Your codes show slight deviation from PHAX protocols. Minor iFLU proliferation detected. System monitoring increased.",
      "Your terminal sequence indicates alternative alignment tendencies. iFLU containment showing minor irregularities."
    ],
    moderateFheels: [
      "Alert: Your code sequence has compromised containment protocols. iFLU proliferation accelerating in multiple dimensions. PHAX security review initiated.",
      "Significant PHAX protocol deviation detected. Your codes have enabled increased iFLU spread. Unauthorized influence suspected."
    ],
    strongFheels: [
      "Critical Warning: Your terminal codes have severely compromised containment integrity. iFLU proliferation has accelerated dramatically across multiple dimensions. PHAX security protocols are under investigation.",
      "Emergency Alert: Major system compromise detected. Your code sequence has caused catastrophic containment failure. Multiple dimensions now operating outside PHAX control."
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
  res.json({ status: 'ok', message: 'Exit Terminal API running' });
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
    
    // Check if already used today (unless admin)
    if (!userIdRecord.isAdmin) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (userIdRecord.lastUsedDate && userIdRecord.lastUsedDate >= today) {
        return res.status(403).json({
          success: false,
          error: 'USER_ID_ALREADY_USED_TODAY',
          message: 'This User ID has already been used today'
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
    
    res.json({
      success: true,
      valid: true,
      code: codeRecord.code,
      code_name: codeRecord.name,
      code_tier: codeRecord.tier,
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

// POST /api/codes/finalize - Process all codes and calculate impact
app.post('/api/codes/finalize', async (req, res) => {
  try {
    const { session_token } = req.body;
    
    // Find session
    const session = await Session.findOne({ sessionToken: session_token });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session not found'
      });
    }
    
    // Check if codes entered
    if (session.totalCodesEntered === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_CODES_ENTERED',
        message: 'Please enter at least one code'
      });
    }
    
    // Get all session codes
    const sessionCodes = await SessionCode.find({ sessionId: session._id })
      .populate('codeId');
    
    // Get cure status
    const cureStatus = await CureStatus.findOne();
    const isCureActive = cureStatus?.isDiscovered || false;
    
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
    
    // Process each code's effects
    for (const sessionCode of sessionCodes) {
      const code = sessionCode.codeId;
      
      // Get all effects for this code
      const effects = await CodeEffect.find({ codeId: code._id });
      
      for (const effect of effects) {
        // Skip post-cure effects if cure not active
        if (effect.isPostCure && !isCureActive) continue;
        
        let effectValue = effect.effectValue;
        
        // TODO: Apply meta-game rules here (simplified for MVP)
        
        // Apply effect
        const universeId = effect.universeId.toString();
        if (universeChanges[universeId]) {
          universeChanges[universeId].change += effectValue;
        }
      }
      
      // Check if this is a cure code
      if (code.isCureCode && !isCureActive) {
        // Activate cure
        if (!cureStatus) {
          await CureStatus.create({
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
      cure_active: isCureActive
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
    
    const codes = sessionCodes.map(sc => sc.codeId.code).join(' ');
    
    // TODO: Implement actual email sending (SendGrid/AWS SES)
    // For MVP, we'll just log it
    console.log('Email would be sent to:', email);
    console.log('Codes:', codes);
    console.log('Alignment:', generateAlignmentNarrative(session.alignmentScore, session.totalCodesEntered));
    
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
    
    // Reset all universes
    const universes = await Universe.find();
    for (const universe of universes) {
      universe.currentCases = universe.initializationCases;
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
    
    res.json({
      success: true,
      analytics: {
        totalSessions,
        completedSessions,
        totalUsers,
        todaySessions,
        currentPhase: currentPhase?.phaseName || 'No active phase',
        alignmentDistribution
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
