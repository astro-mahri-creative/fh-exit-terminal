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
  CureStatus
} = require('../models');

async function initDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Clear existing data
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

    // Initialize Universe Status Thresholds
    console.log('Creating universe status thresholds...');
    await UniverseStatusThreshold.create([
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
      }
    ]);

    // Initialize Universes
    console.log('Creating universes...');
    const universeData = [
      { name: 'D3N.74L', initCases: 437291 },
      { name: 'M1D.H00', initCases: 1823054 },
      { name: 'PL4.N75', initCases: 19182 },
      { name: '789.YKK', initCases: 891437 },
      { name: 'L0K.R99', initCases: 2544763 },
      { name: 'R4I.K1N', initCases: 156820 },
      { name: '50H.YP3', initCases: 72459 },
      { name: 'DP4.35T', initCases: 614388 },
      { name: 'GA1.A14', initCases: 1247901 },
      { name: 'BX9.R55', initCases: 308547 }
    ];

    const createdUniverses = [];
    for (let i = 0; i < universeData.length; i++) {
      const u = universeData[i];
      const currentCases = Math.floor(u.initCases * 0.5);
      let status = 'COMPROMISED';
      let canSpread = true;

      if (currentCases >= u.initCases * 0.85) {
        status = 'LIBERATED';
        canSpread = false;
      } else if (currentCases <= u.initCases * 0.15) {
        status = 'PRESERVED';
        canSpread = false;
      }

      const universe = await Universe.create({
        name: u.name,
        displayOrder: i + 1,
        initializationCases: u.initCases,
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

      // RMPI effects (Tier 4 — Amplify 2.4x, 10 independent random targets)
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },
      { code: 'RMPI', effect: 2.4, effectType: 'amplify' },

      // PRWC effects (Tier 2 — Amplify 1.3x, 10 independent random targets)
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },
      { code: 'PRWC', effect: 1.3, effectType: 'amplify' },

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
          targetMode: 'random',
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
      
      // Quarantined states
      { text: 'EMERGENCY QUARANTINE INITIATED. SECTOR ISOLATED FOR SYSTEM PROTECTION.', trigger: 'quarantined_states' },
      { text: 'CRITICAL INSTABILITY DETECTED. RAPID FLUCTUATION CONTAINMENT IN PROGRESS.', trigger: 'quarantined_states' },
      { text: 'DIMENSIONAL QUARANTINE ACTIVE. UNAUTHORIZED ACCESS RESTRICTED.', trigger: 'quarantined_states' },
      
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

    // Initialize User IDs (5 admin + 20 visitor)
    console.log('Creating user IDs...');
    const adminIds = ['admin1', 'admin2', 'admin3', 'fhadmn', 'phaxad'];
    for (const adminId of adminIds) {
      await UserId.create({
        userId: adminId,
        isAdmin: true
      });
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
