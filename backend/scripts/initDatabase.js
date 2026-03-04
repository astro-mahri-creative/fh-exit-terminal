require('dotenv').config();
const mongoose = require('mongoose');
const {
  Universe,
  UniverseStatusThreshold,
  Code,
  CodeEffect,
  UserId,
  Phase,
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
    await PhaxAlertMessage.deleteMany({});
    await CureStatus.deleteMany({});

    // Initialize Universe Status Thresholds
    console.log('Creating universe status thresholds...');
    await UniverseStatusThreshold.create([
      {
        statusName: 'OPTIMIZED',
        minCases: 0,
        maxCases: 500,
        canSpread: false,
        description: 'PHAX success - tech advancement hub',
        colorPrimary: '#C0C0C0',
        colorSecondary: '#0066FF'
      },
      {
        statusName: 'ACTIVE',
        minCases: 1000,
        maxCases: 75000,
        canSpread: true,
        description: 'Standard operational state',
        colorPrimary: '#808080',
        colorSecondary: '#FFFFFF'
      },
      {
        statusName: 'COMPROMISED',
        minCases: 90000,
        maxCases: 149999,
        canSpread: true,
        description: 'FHEELS infiltration - warning state',
        colorPrimary: '#FFA500',
        colorSecondary: '#00FF00'
      },
      {
        statusName: 'QUARANTINED',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'Emergency unstable state',
        colorPrimary: '#FF0000',
        colorSecondary: '#8B0000'
      },
      {
        statusName: 'LIBERATED',
        minCases: 150000,
        maxCases: null,
        canSpread: false,
        description: 'FHEELS victory - disconnected from PHAX',
        colorPrimary: '#8B4513',
        colorSecondary: '#FFD700'
      },
      {
        statusName: 'TRANSCENDENT',
        minCases: null,
        maxCases: null,
        canSpread: false,
        description: 'Perfect balance despite conflict',
        colorPrimary: '#9370DB',
        colorSecondary: '#00CED1'
      }
    ]);

    // Initialize Universes
    console.log('Creating universes...');
    const universeData = [
      { name: 'D3N.74L', initCases: 45230 },
      { name: 'Epsilon Sector', initCases: 128500 },
      { name: 'Universe Gamma', initCases: 850 },
      { name: 'Delta Quadrant', initCases: 95400 },
      { name: 'Zeta Prime', initCases: 234000 },
      { name: 'Theta Complex', initCases: 12000 },
      { name: 'Iota Realm', initCases: 250 },
      { name: 'Kappa Dimension', initCases: 67800 },
      { name: 'Lambda Space', initCases: 156700 },
      { name: 'Mu Territory', initCases: 42100 }
    ];

    const createdUniverses = [];
    for (let i = 0; i < universeData.length; i++) {
      const u = universeData[i];
      let status = 'ACTIVE';
      let canSpread = true;
      
      if (u.initCases <= 500) {
        status = 'OPTIMIZED';
        canSpread = false;
      } else if (u.initCases >= 150000) {
        status = 'LIBERATED';
        canSpread = false;
      } else if (u.initCases >= 90000) {
        status = 'COMPROMISED';
      }
      
      const universe = await Universe.create({
        name: u.name,
        displayOrder: i + 1,
        initializationCases: u.initCases,
        currentCases: u.initCases,
        status,
        canSpread
      });
      createdUniverses.push(universe);
    }

    // Initialize Codes (Sample set - 50+ codes)
    console.log('Creating codes...');
    const codesData = [
      // Tier 1: Standard PHAX Protocol Codes (15 codes)
      { code: 'PHMX', tier: 1, name: 'Standard Protocol MX', alignment: 'PHAX' },
      { code: 'TECH', tier: 1, name: 'Tech Integration', alignment: 'PHAX' },
      { code: 'PHCT', tier: 1, name: 'Containment Protocol', alignment: 'PHAX' },
      { code: 'PHSN', tier: 1, name: 'Sanitization Protocol', alignment: 'PHAX' },
      { code: 'PHQR', tier: 1, name: 'Quarantine Routine', alignment: 'PHAX' },
      { code: 'PHSC', tier: 1, name: 'Security Check', alignment: 'PHAX' },
      { code: 'PHDX', tier: 1, name: 'Diagnostic Procedure', alignment: 'PHAX' },
      { code: 'PHMD', tier: 1, name: 'Medical Protocol', alignment: 'PHAX' },
      { code: 'PHVC', tier: 1, name: 'Vaccine Distribution', alignment: 'PHAX' },
      { code: 'PHTR', tier: 1, name: 'Treatment Regimen', alignment: 'PHAX' },
      { code: 'PHMN', tier: 1, name: 'Monitoring System', alignment: 'PHAX' },
      { code: 'PHDT', tier: 1, name: 'Detection Array', alignment: 'PHAX' },
      { code: 'PHSG', tier: 1, name: 'Safeguard Measures', alignment: 'PHAX' },
      { code: 'PHPR', tier: 1, name: 'Prevention Protocol', alignment: 'PHAX' },
      { code: 'PHCL', tier: 1, name: 'Clearance Level', alignment: 'PHAX' },

      // Tier 2: Hidden FHEELS Infiltration Codes (12 codes)
      { code: 'FHGD', tier: 2, name: 'Alternative Therapy', alignment: 'FHEELS' },
      { code: 'ROQY', tier: 2, name: 'Supplemental Treatment', alignment: 'FHEELS' },
      { code: 'FHNT', tier: 2, name: 'Nature Therapy', alignment: 'FHEELS' },
      { code: 'FHOR', tier: 2, name: 'Organic Remedy', alignment: 'FHEELS' },
      { code: 'FHWD', tier: 2, name: 'Wild Protocol', alignment: 'FHEELS' },
      { code: 'FHGR', tier: 2, name: 'Growth Enhancer', alignment: 'FHEELS' },
      { code: 'FHBM', tier: 2, name: 'Biome Restoration', alignment: 'FHEELS' },
      { code: 'FHEC', tier: 2, name: 'Ecosystem Balance', alignment: 'FHEELS' },
      { code: 'FHPL', tier: 2, name: 'Plant Medicine', alignment: 'FHEELS' },
      { code: 'FHSM', tier: 2, name: 'Symbiosis Mode', alignment: 'FHEELS' },
      { code: 'FHRF', tier: 2, name: 'Rewilding Force', alignment: 'FHEELS' },
      { code: 'FHVT', tier: 2, name: 'Vitality Boost', alignment: 'FHEELS' },

      // Tier 3: PHAX Security Protocols (10 codes)
      { code: 'CLRN', tier: 3, name: 'Multi-dimensional Optimization', alignment: 'PHAX' },
      { code: 'NTPG', tier: 3, name: 'System Purification', alignment: 'PHAX' },
      { code: 'PHXS', tier: 3, name: 'Cross-System Security', alignment: 'PHAX' },
      { code: 'PHAC', tier: 3, name: 'Advanced Containment', alignment: 'PHAX' },
      { code: 'PHUL', tier: 3, name: 'Ultra-Lock Protocol', alignment: 'PHAX' },
      { code: 'PHQZ', tier: 3, name: 'Quarantine Zone', alignment: 'PHAX' },
      { code: 'PHFX', tier: 3, name: 'Firewall Extreme', alignment: 'PHAX' },
      { code: 'PHBD', tier: 3, name: 'Barrier Defense', alignment: 'PHAX' },
      { code: 'PHSH', tier: 3, name: 'Shield Hardening', alignment: 'PHAX' },
      { code: 'PHDN', tier: 3, name: 'Denial Protocol', alignment: 'PHAX' },

      // Tier 4: FHEELS Hacking Operations (8 codes)
      { code: 'LWME', tier: 4, name: 'Project Lasagna Breach', alignment: 'FHEELS' },
      { code: 'BKDR', tier: 4, name: 'Backdoor Access', alignment: 'FHEELS' },
      { code: 'FHBR', tier: 4, name: 'Barrier Break', alignment: 'FHEELS' },
      { code: 'FHOV', tier: 4, name: 'Override Sequence', alignment: 'FHEELS' },
      { code: 'FHCR', tier: 4, name: 'Corruption Wave', alignment: 'FHEELS' },
      { code: 'FHIN', tier: 4, name: 'Infiltration Deep', alignment: 'FHEELS' },
      { code: 'FHVR', tier: 4, name: 'Viral Release', alignment: 'FHEELS' },
      { code: 'FHEX', tier: 4, name: 'Exponential Spread', alignment: 'FHEELS' },

      // Tier 5: Ultimate System Exploits (4 codes)
      { code: 'BHLE', tier: 5, name: 'Black Hole Liberation', alignment: 'FHEELS', isCureCode: false },
      { code: 'NIIX', tier: 5, name: 'Dimensional Liberation', alignment: 'FHEELS' },
      { code: 'PHOM', tier: 5, name: 'Omega Protocol', alignment: 'PHAX' },
      { code: 'CUIX', tier: 5, name: 'Cure Initiative X', alignment: 'PHAX', isCureCode: true },

      // Tier 6: Network Liberation (1 code)
      { code: 'LBRT', tier: 6, name: 'Total Liberation', alignment: 'FHEELS' }
    ];

    const createdCodes = [];
    for (const codeData of codesData) {
      const code = await Code.create(codeData);
      createdCodes.push(code);
    }

    // Initialize Code Effects
    console.log('Creating code effects...');
    const codeEffectsData = [
      // PHMX effects (Tier 1)
      { code: 'PHMX', universe: 'D3N.74L', effect: -400 },
      { code: 'PHMX', universe: 'Delta Quadrant', effect: -200 },
      
      // TECH effects (Tier 1)
      { code: 'TECH', universe: 'Epsilon Sector', effect: -300 },
      { code: 'TECH', universe: 'Theta Complex', effect: -250 },
      
      // FHGD effects (Tier 2)
      { code: 'FHGD', universe: 'Universe Gamma', effect: 150 },
      { code: 'FHGD', universe: 'Iota Realm', effect: 100 },
      
      // ROQY effects (Tier 2)
      { code: 'ROQY', universe: 'Kappa Dimension', effect: 300 },
      { code: 'ROQY', universe: 'Mu Territory', effect: 250 },
      
      // CLRN effects (Tier 3)
      { code: 'CLRN', universe: 'D3N.74L', effect: -300 },
      { code: 'CLRN', universe: 'Epsilon Sector', effect: -250 },
      { code: 'CLRN', universe: 'Delta Quadrant', effect: -250 },
      
      // NTPG effects (Tier 3)
      { code: 'NTPG', universe: 'Theta Complex', effect: -600 },
      { code: 'NTPG', universe: 'Kappa Dimension', effect: -400 },
      
      // LWME effects (Tier 4)
      { code: 'LWME', universe: 'Zeta Prime', effect: 500 },
      { code: 'LWME', universe: 'Lambda Space', effect: 200 },
      
      // BKDR effects (Tier 4)
      { code: 'BKDR', universe: 'Epsilon Sector', effect: 800 },
      { code: 'BKDR', universe: 'Delta Quadrant', effect: 900 },
      { code: 'BKDR', universe: 'Theta Complex', effect: 800 },
      
      // BHLE effects (Tier 5)
      { code: 'BHLE', universe: 'Zeta Prime', effect: 5000 },
      
      // NIIX effects (Tier 5)
      { code: 'NIIX', universe: 'Lambda Space', effect: 3000 },
      
      // LBRT effects (Tier 6)
      { code: 'LBRT', universe: 'all', effect: 1000 }
    ];

    for (const effectData of codeEffectsData) {
      const code = createdCodes.find(c => c.code === effectData.code);
      
      if (effectData.universe === 'all') {
        // Apply to all universes
        for (const universe of createdUniverses) {
          await CodeEffect.create({
            codeId: code._id,
            universeId: universe._id,
            effectValue: effectData.effect,
            effectType: 'standard'
          });
        }
      } else {
        const universe = createdUniverses.find(u => u.name === effectData.universe);
        if (universe && code) {
          await CodeEffect.create({
            codeId: code._id,
            universeId: universe._id,
            effectValue: effectData.effect,
            effectType: 'standard'
          });
        }
      }
    }

    // Add more effects for remaining codes (spread them across universes)
    for (const code of createdCodes) {
      const existingEffects = await CodeEffect.countDocuments({ codeId: code._id });
      
      if (existingEffects === 0) {
        // Add random effects for codes without effects
        const numEffects = Math.min(code.tier, 3);
        const randomUniverses = createdUniverses
          .sort(() => Math.random() - 0.5)
          .slice(0, numEffects);
        
        for (const universe of randomUniverses) {
          const baseEffect = code.alignment === 'PHAX' ? -200 : 150;
          const multiplier = code.tier * 0.5;
          const effect = Math.floor(baseEffect * multiplier);
          
          await CodeEffect.create({
            codeId: code._id,
            universeId: universe._id,
            effectValue: effect,
            effectType: 'standard'
          });
        }
      }
    }

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
      
      // Compromised states
      { text: 'WARNING: UNAUTHORIZED INFILTRATION DETECTED IN MULTIPLE SECTORS. CONTAINMENT PROTOCOLS FAILING.', trigger: 'compromised_states' },
      { text: 'ALERT: IFLU PROLIFERATION ACCELERATING. FHEELS INTERFERENCE SUSPECTED.', trigger: 'compromised_states' },
      { text: 'SYSTEM INTEGRITY COMPROMISED. INVESTIGATING TERMINAL CODE ANOMALIES.', trigger: 'compromised_states' },
      { text: 'CONTAINMENT BREACH DETECTED. DIMENSIONAL STABILITY DETERIORATING.', trigger: 'compromised_states' },
      
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
