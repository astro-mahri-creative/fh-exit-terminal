const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const {
  Universe,
  UniverseStatusThreshold,
  Code,
  CodeEffect,
  UserId,
  Phase,
  MetaGameRule,
  PhaxAlertMessage,
  CureStatus,
  Session,
  SessionCode,
  AnalyticsLog
} = require('../models');

// ─── Safety guard ─────────────────────────────────────────────────────
// This script wipes foundational collections (Universe, Code, UserId, …)
// and is destructive. backend/.env points at the production Atlas cluster
// in this repo, so an accidental `npm run init-db` will nuke prod codes
// and orphan every SessionCode that references them. Require an explicit
// opt-in flag so the destructive run can never happen by reflex.
//
// To run intentionally:
//   INIT_DB_FORCE=1 npm run init-db     (any shell)
//   npm run init-db -- --force          (works through npm script forwarder)
// ──────────────────────────────────────────────────────────────────────
const forceFromArg = process.argv.slice(2).includes('--force');
const forceFromEnv = process.env.INIT_DB_FORCE === '1' || process.env.INIT_DB_FORCE === 'true';
if (!forceFromArg && !forceFromEnv) {
  // Show what we'd be aiming at so a careful operator can sanity-check.
  let host = 'unknown';
  try {
    const m = (process.env.MONGODB_URI || '').match(/@([^/?]+)/);
    if (m) host = m[1];
  } catch (_) { /* noop */ }
  console.error('\n╳ initDatabase.js refused to run without an explicit force flag.');
  console.error('  Target MongoDB host: ' + host);
  console.error('  This will delete: Universe, UniverseStatusThreshold, Code, CodeEffect, UserId,');
  console.error('                    Phase, MetaGameRule, PhaxAlertMessage, CureStatus, Session, SessionCode.');
  console.error('  AnalyticsLog is preserved (it is the source of truth for the admin analytics tab).');
  console.error('  Re-run with:  INIT_DB_FORCE=1 npm run init-db   OR   npm run init-db -- --force\n');
  process.exit(1);
}

async function initDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Clear existing data. AnalyticsLog is intentionally NOT wiped — the
    // admin analytics endpoint sources from it and we want the historical
    // signal to survive reseeds. Session + SessionCode ARE wiped so that
    // regenerating Codes (new ObjectIds) doesn't leave a trail of orphan
    // session_code rows pointing at deleted code documents.
    console.log('Clearing existing data...');
    await Universe.deleteMany({});
    await UniverseStatusThreshold.deleteMany({});
    await Code.deleteMany({});
    await CodeEffect.deleteMany({});
    await UserId.deleteMany({});
    await Phase.deleteMany({});
    await MetaGameRule.deleteMany({});
    await PhaxAlertMessage.deleteMany({});
    await CureStatus.deleteMany({});
    await Session.deleteMany({});
    await SessionCode.deleteMany({});

    // Initialize Universe Status Thresholds
    console.log('Creating universe status thresholds...');
    await UniverseStatusThreshold.create([
      {
        statusName: 'TRANSCENDED',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'Dimensional transcendence - completely locked, no effects',
        colorPrimary: '#9575cd',
        colorSecondary: '#5e35b1'
      },
      {
        statusName: 'PRESERVED',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'PHAX stronghold - cases locked low, no increases allowed',
        colorPrimary: '#4a90d9',
        colorSecondary: '#2a5a8a'
      },
      {
        statusName: 'COMPROMISED',
        minCases: null,
        maxCases: null,
        canSpread: true,
        description: 'Contested territory - all effects active',
        colorPrimary: '#FFA500',
        colorSecondary: '#00FF00'
      },
      {
        statusName: 'LIBERATED',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'FHEELS victory - fully locked from all effects',
        colorPrimary: '#8B4513',
        colorSecondary: '#FFD700'
      },
      {
        statusName: 'QUARANTINED',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'Total quarantine - completely locked, no effects',
        colorPrimary: '#c94040',
        colorSecondary: '#7b1a1a'
      }
    ]);

    // Initialize Universes
    console.log('Creating universes...');
    const universeData = [
      { name: 'D3N.74L', initCases: 437291, startPct: 0.28 },
      { name: 'M1D.H00', initCases: 1823054, startPct: 0.50 },
      { name: 'PL4.N75', initCases: 19182, startPct: 0.40 },
      { name: '789.YKK', initCases: 891437, startPct: 0.38 },
      { name: 'L0K.R99', initCases: 2544763, startPct: 0.60 },
      { name: '50H.YP3', initCases: 72459, startPct: 0.55 },
      { name: 'DP4.35T', initCases: 614388, startPct: 0.72 },
      { name: 'GA1.A14', initCases: 1247901, startPct: 0.35 },
      { name: 'BX9.R55', initCases: 308547, startPct: 0.62 }
    ];

    const createdUniverses = [];
    for (let i = 0; i < universeData.length; i++) {
      const u = universeData[i];
      const currentCases = Math.floor(u.initCases * u.startPct);
      let status = 'COMPROMISED';
      let canSpread = true;

      if (currentCases >= u.initCases) {
        status = 'QUARANTINED';
        canSpread = false;
      } else if (currentCases <= 0) {
        status = 'TRANSCENDED';
        canSpread = false;
      } else if (currentCases >= u.initCases * 0.70) {
        status = 'LIBERATED';
        canSpread = false;
      } else if (currentCases <= u.initCases * 0.30) {
        status = 'PRESERVED';
        canSpread = false;
      }

      const universe = await Universe.create({
        name: u.name,
        displayOrder: i + 1,
        initializationCases: u.initCases,
        initialCurrentCases: currentCases,
        currentCases,
        status,
        canSpread
      });
      createdUniverses.push(universe);
    }

    // Initialize Codes
    // Source: Project L Puzzle Component Catalog — Terminal Codes sheet
    // Only codes with a populated STATUS value are included.
    // Effect dimension assignments marked TBD pending universe mapping finalization.
    console.log('Creating codes...');
    const codesData = [
      // Tier 1: PHAX — Phase 1 PRODUCTION
      {
        code: 'CERT',
        tier: 1,
        name: 'Certification Protocol',
        alignment: 'PHAX',
        status: 'Phase 1 PRODUCTION',
        sourceRoom: 'PHXHUB',
        discoveryMethod: 'Screen',
        effectType: 'Eradicate'
      },

      // Tier 2: PHAX — Phase 1 COMPLETE
      {
        code: 'TPGM',
        tier: 2,
        name: 'Top Game Cipher',
        alignment: 'PHAX',
        status: 'Phase 1 COMPLETE',
        sourceRoom: 'ARCADE',
        discoveryMethod: 'Screen',
        effectType: 'Eradicate'
      },

      // Tier 2: FHEELS — Phase 1 FABRICATION
      {
        code: 'MGBC',
        tier: 2,
        name: 'Margin Book Cipher',
        alignment: 'FHEELS',
        status: 'Phase 1 FABRICATION',
        sourceRoom: 'PERCEP',
        discoveryMethod: 'Physical',
        effectType: 'Spread'
      },

      // Tier 3: FHEELS — Phase 1
      {
        code: 'CMPR',
        tier: 3,
        name: 'Compare Protocol',
        alignment: 'FHEELS',
        status: 'Phase 1',
        sourceRoom: 'BATTIC',
        discoveryMethod: 'Physical',
        effectType: 'Spread'
      },

      // Tier 4: FHEELS — Phase 1 TESTING
      {
        code: 'OPLT',
        tier: 4,
        name: 'Compliance Audit',
        alignment: 'FHEELS',
        status: 'Phase 1 TESTING',
        sourceRoom: 'SPLTFU',
        discoveryMethod: 'Physical',
        effectType: 'Spread'
      },

      // Tier 4: FHEELS
      {
        code: 'SGMA',
        tier: 4,
        name: 'Sigma Infiltration',
        alignment: 'FHEELS',
        status: 'Phase 1',
        discoveryMethod: 'Physical',
        effectType: 'Spread'
      },

      // Tier 4: SIGSEV — Phase 1
      {
        code: 'RMPI',
        tier: 4,
        name: 'Recruitment Package',
        alignment: 'SIGSEV',
        status: 'Phase 1',
        sourceRoom: 'BITEHL',
        discoveryMethod: 'Physical',
        effectType: 'Amplify'
      },

      // Tier 2: SIGSEV — Phase 1
      {
        code: 'PRWC',
        tier: 2,
        name: 'Hallway B Amplifier',
        alignment: 'SIGSEV',
        status: 'Phase 1',
        sourceRoom: 'SPLTFU',
        discoveryMethod: 'Sensory',
        effectType: 'Amplify'
      },

      // Tier 5: SIGSEV — Break Preserved
      {
        code: 'RVLT',
        tier: 5,
        name: 'Revolution Protocol',
        alignment: 'SIGSEV',
        status: 'Phase 1',
        discoveryMethod: 'Physical',
        effectType: 'Break Preserved'
      },

      // Tier 5: PHAX — Break Liberated
      {
        code: 'CURE',
        tier: 5,
        name: 'Containment Override',
        alignment: 'PHAX',
        status: 'Phase 1',
        discoveryMethod: 'Physical',
        effectType: 'Break Liberated'
      }
    ];

    const createdCodes = [];
    for (const codeData of codesData) {
      const code = await Code.create(codeData);
      createdCodes.push(code);
    }

    // Initialize Code Effects
    // Effect dimension (universe) assignments are TBD in the source catalog.
    // Values are sourced directly from the Terminal Codes sheet.
    // Update universe references once dimension mapping is finalized.
    console.log('Creating code effects...');
    const codeEffectsData = [
      // CERT effects (Tier 1 — Eradicate)
      { code: 'CERT', effect: -400, effectType: 'standard' },

      // TPGM effects (Tier 2 — Eradicate, two separate effects)
      { code: 'TPGM', effect: -900, effectType: 'standard' },
      { code: 'TPGM', effect: -700, effectType: 'standard' },

      // MGBC effects (Tier 2 — Spread)
      { code: 'MGBC', effect: 600, effectType: 'standard' },

      // CMPR effects (Tier 3 — Spread)
      { code: 'CMPR', effect: 1400, effectType: 'standard' },

      // OPLT effects (Tier 4 — Spread)
      { code: 'OPLT', effect: 2500, effectType: 'standard' },

      // SGMA effects (Tier 4 — Spread)
      { code: 'SGMA', effect: 2200, effectType: 'standard' },

      // RMPI effects (Tier 4 — Amplify 2.4x, applies to all universes)
      { code: 'RMPI', effect: 2.4, effectType: 'amplify', targetMode: 'all' },

      // PRWC effects (Tier 2 — Amplify 1.3x, applies to all universes)
      { code: 'PRWC', effect: 1.3, effectType: 'amplify', targetMode: 'all' },

      // RVLT effects (Tier 5 — Break Preserved)
      { code: 'RVLT', effect: 0, effectType: 'break_preserved' },

      // CURE effects (Tier 5 — Break Liberated)
      { code: 'CURE', effect: 0, effectType: 'break_liberated' }
    ];

    for (const effectData of codeEffectsData) {
      const code = createdCodes.find(c => c.code === effectData.code);
      if (code) {
        await CodeEffect.create({
          codeId: code._id,
          universeId: null,
          targetMode: effectData.targetMode || 'random',
          effectValue: effectData.effect,
          effectType: effectData.effectType
        });
      }
    }

    // Initialize Meta-Game Rules
    console.log('Creating meta-game rules...');
    await MetaGameRule.create([
      {
        ruleName: 'Compromised Amplification',
        conditionType: 'universe_status',
        conditionDefinition: JSON.stringify({ any_universe_status: 'COMPROMISED' }),
        effectDefinition: JSON.stringify({ multiplier: 2.0, applies_to: 'code_tiers', tiers: [4, 5] }),
        isActive: true,
        priority: 10
      },
      {
        ruleName: 'Synergy Protocol',
        conditionType: 'code_combination',
        conditionDefinition: JSON.stringify({ required_codes: ['CERT', 'TPGM', 'MGBC'] }),
        effectDefinition: JSON.stringify({ bonus_effect: { universe: 'all', value: -500 } }),
        isActive: true,
        priority: 5
      },
      {
        ruleName: 'Phase 2 Cure Unlock',
        conditionType: 'phase_specific',
        conditionDefinition: JSON.stringify({ phase_number: 2, total_cases_below: 100000 }),
        effectDefinition: JSON.stringify({ trigger_cure: true }),
        isActive: true,
        priority: 20
      }
    ]);

    // Initialize PHAX Alert Messages
    console.log('Creating PHAX alert messages...');
    const messagesData = [
      // Optimized states
      { text: 'CONTAINMENT PROTOCOLS OPTIMAL. DIMENSIONAL STABILITY AT 98.7%. EXCELLENT WORK, TERMINAL OPERATOR.', trigger: 'optimized_states' },
      { text: 'IFLU SUPPRESSION SUCCESSFUL ACROSS MULTIPLE SECTORS. PHAX ADVANCEMENT PROTOCOLS ENGAGED.', trigger: 'optimized_states' },
      { text: 'SYSTEM EFFICIENCY MAXIMIZED. TECH-INTEGRATION HUBS EXPANDING. CONTINUE CURRENT TRAJECTORY.', trigger: 'optimized_states' },
      
      // Active/stable states
      { text: 'DIMENSIONAL NETWORK STATUS: STABLE. IFLU CONTAINMENT WITHIN ACCEPTABLE PARAMETERS.', trigger: 'active_stable_states' },
      { text: 'MONITORING CONTINUES. ALL SECTORS REPORTING STANDARD OPERATIONAL METRICS.', trigger: 'active_stable_states' },
      { text: 'PHAX PROTOCOLS MAINTAINING EQUILIBRIUM. VIGILANCE REQUIRED.', trigger: 'active_stable_states' },
      
      // Compromised is the normal baseline — use neutral monitoring messages
      { text: 'MONITORING CONTINUES. DIMENSIONAL NETWORK WITHIN EXPECTED PARAMETERS.', trigger: 'compromised_states' },
      { text: 'STANDARD OPERATIONS. IFLU CASE LEVELS HOLDING ACROSS ALL SECTORS.', trigger: 'compromised_states' },
      { text: 'ALL SECTORS ONLINE. AWAITING TERMINAL OPERATOR INPUT.', trigger: 'compromised_states' },
      
      // Liberated states
      { text: 'CRITICAL FAILURE: SECTOR CONNECTION LOST. DIMENSIONAL NETWORK BREACHED.', trigger: 'liberated_states' },
      { text: 'EMERGENCY PROTOCOLS ACTIVATED. UNAUTHORIZED LIBERATION SEQUENCE DETECTED.', trigger: 'liberated_states' },
      { text: 'CATASTROPHIC CONTAINMENT FAILURE. PHAX AUTHORITY UNDERMINED.', trigger: 'liberated_states' },
      
      // Locked states (QUARANTINED or TRANSCENDED)
      { text: 'DIMENSIONAL LOCK DETECTED. ONE OR MORE SECTORS BEYOND OPERATIONAL REACH.', trigger: 'locked_states' },
      { text: 'PERMANENT STATUS LOCK CONFIRMED. AFFECTED SECTORS NO LONGER RESPOND TO CODE INPUT.', trigger: 'locked_states' },
      { text: 'IRREVERSIBLE STATE ACHIEVED. LOCKED DIMENSIONS REQUIRE ADMINISTRATIVE OVERRIDE.', trigger: 'locked_states' },
      
      // Cure discovery
      { text: 'ALERT: ANOMALOUS HEALING PROTOCOL DETECTED. SOURCE UNKNOWN. ANALYZING...', trigger: 'cure_discovery' },
      { text: 'WARNING: UNAUTHORIZED CURE SEQUENCE ACTIVATED. PHAX REVIEW PENDING.', trigger: 'cure_discovery' },
      
      // Balanced/mixed states
      { text: 'DIMENSIONAL NETWORK STATUS: VARIABLE. MULTIPLE CONTAINMENT STATES ACTIVE.', trigger: 'balanced_states' },
      { text: 'SYSTEM ANALYSIS: CONFLICTING PROTOCOLS DETECTED. PERFORMANCE INCONSISTENT.', trigger: 'balanced_states' },
      
      // Extreme FHEELS victory
      { text: 'SYSTEM FAILURE IMMINENT. FHEELS INFILTRATION AT CRITICAL LEVELS.', trigger: 'extreme_fheels_victory' },
      { text: 'CATASTROPHIC NETWORK COLLAPSE. MULTIPLE DIMENSIONAL DISCONNECTIONS.', trigger: 'extreme_fheels_victory' }
    ];

    for (const msgData of messagesData) {
      await PhaxAlertMessage.create({
        messageText: msgData.text,
        triggerCondition: msgData.trigger,
        isActive: true
      });
    }

    // Initialize User IDs (5 admin + 20 visitor + 1 kiosk)
    console.log('Creating user IDs...');
    const adminIds = ['admin1', 'admin2', 'admin3', 'fhadmn', 'phaxad'];
    for (const adminId of adminIds) {
      await UserId.create({
        userId: adminId,
        isAdmin: true
      });
    }

    // TV Wall kiosk login — admin so it bypasses the daily-session block
    // and can recover from a power blip without waiting for the 4am reset.
    const tvwallExists = await UserId.findOne({ userId: 'tvwall' });
    if (!tvwallExists) {
      await UserId.create({ userId: 'tvwall', isAdmin: true });
    }

    // Generate 20 random visitor IDs
    for (let i = 0; i < 20; i++) {
      const userId = Math.random().toString(36).substring(2, 8).toLowerCase();
      await UserId.create({
        userId,
        isAdmin: false
      });
    }

    // Initialize Phase
    console.log('Creating initial phase...');
    await Phase.create({
      phaseNumber: 1,
      phaseName: 'Phase 1',
      isActive: true,
      narrativeDescription: 'Initial containment operations'
    });

    // Initialize Cure Status
    console.log('Creating cure status...');
    await CureStatus.create({
      isDiscovered: false
    });

    // Mark the seed completion as a system_reset in AnalyticsLog. The
    // analytics endpoint uses the latest system_reset event as the cutoff
    // for the active analytics period, so logging one here ensures the
    // admin tab reflects "this incarnation of the dataset" only, instead
    // of carrying over stats from before the reseed.
    console.log('Recording analytics reset point...');
    await AnalyticsLog.create({
      eventType: 'system_reset',
      userId: null,
      eventData: JSON.stringify({ source: 'init-db-script' })
    });

    console.log('\n✅ Database initialization complete!');
    console.log('\nCreated:');
    console.log(`- ${createdUniverses.length} universes`);
    console.log(`- ${createdCodes.length} codes`);
    console.log(`- ${await CodeEffect.countDocuments()} code effects`);
    console.log(`- ${messagesData.length} PHAX alert messages`);
    console.log(`- ${adminIds.length} admin user IDs`);
    console.log(`- 20 visitor user IDs`);
    
    console.log('\nAdmin User IDs:');
    adminIds.forEach(id => console.log(`  - ${id}`));
    
    console.log('\nSample Visitor User IDs:');
    const sampleVisitors = await UserId.find({ isAdmin: false }).limit(5);
    sampleVisitors.forEach(u => console.log(`  - ${u.userId}`));

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();
