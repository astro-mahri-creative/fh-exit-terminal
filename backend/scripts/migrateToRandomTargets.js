const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const {
  Universe,
  Code,
  CodeEffect,
  AdminSettings
} = require('../models');

function calculateUniverseStatus(currentCases, initializationCases) {
  if (currentCases >= initializationCases * 0.85) return 'LIBERATED';
  if (currentCases <= initializationCases * 0.15) return 'PRESERVED';
  return 'COMPROMISED';
}

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // 1. Update all CodeEffect docs to random targeting
    console.log('Updating all CodeEffect docs to random targeting...');
    await CodeEffect.updateMany({}, {
      $set: { targetMode: 'random', universeId: null }
    });

    // 2. For RMPI/PRWC: ensure 10 independent random-target rows each
    const amplifyTargetCount = 10;
    for (const [codeName, effectVal] of [['RMPI', 2.4], ['PRWC', 1.3]]) {
      const code = await Code.findOne({ code: codeName });
      if (!code) continue;
      const existing = await CodeEffect.find({ codeId: code._id });
      if (existing.length < amplifyTargetCount) {
        const toCreate = amplifyTargetCount - existing.length;
        for (let i = 0; i < toCreate; i++) {
          await CodeEffect.create({
            codeId: code._id,
            universeId: null,
            targetMode: 'random',
            effectValue: effectVal,
            effectType: 'amplify'
          });
        }
        console.log(`  Added ${toCreate} effect rows for ${codeName} (now ${amplifyTargetCount} total)`);
      } else {
        console.log(`  ${codeName} already has ${existing.length} effect rows`);
      }
    }

    // 3. Insert RVLT code and effect if not exists
    let rvlt = await Code.findOne({ code: 'RVLT' });
    if (!rvlt) {
      rvlt = await Code.create({
        code: 'RVLT',
        tier: 5,
        name: 'Revolution Protocol',
        alignment: 'SIGSEV',
        effectType: 'Break Preserved',
        isActive: true
      });
      await CodeEffect.create({
        codeId: rvlt._id,
        universeId: null,
        targetMode: 'random',
        effectValue: 0,
        effectType: 'break_preserved'
      });
      console.log('  Created RVLT code and effect');
    }

    // 4. Insert CURE code and effect if not exists
    let cure = await Code.findOne({ code: 'CURE' });
    if (!cure) {
      cure = await Code.create({
        code: 'CURE',
        tier: 5,
        name: 'Containment Override',
        alignment: 'PHAX',
        effectType: 'Break Liberated',
        isActive: true
      });
      await CodeEffect.create({
        codeId: cure._id,
        universeId: null,
        targetMode: 'random',
        effectValue: 0,
        effectType: 'break_liberated'
      });
      console.log('  Created CURE code and effect');
    }

    // 5. Update initializationCases to new values, reset currentCases to 50%, recalculate statuses
    const initCasesMap = {
      'D3N.74L': 437291,
      'M1D.H00': 1823054,
      'PL4.N75': 19182,
      '789.YKK': 891437,
      'L0K.R99': 2544763,
      'R4I.K1N': 156820,
      '50H.YP3': 72459,
      'DP4.35T': 614388,
      'GA1.A14': 1247901,
      'BX9.R55': 308547
    };

    console.log('Updating universe initializationCases and resetting to 50%...');
    const universes = await Universe.find();
    for (const universe of universes) {
      if (initCasesMap[universe.name]) {
        universe.initializationCases = initCasesMap[universe.name];
      }
      universe.currentCases = Math.floor(universe.initializationCases * 0.5);
      universe.status = calculateUniverseStatus(universe.currentCases, universe.initializationCases);
      universe.canSpread = universe.status === 'COMPROMISED';
      universe.lastUpdated = new Date();
      await universe.save();
      console.log(`  ${universe.name}: init=${universe.initializationCases}, current=${universe.currentCases} -> ${universe.status}`);
    }

    // 6. Ensure effectScale exists in AdminSettings
    const settings = await AdminSettings.getSettings();
    if (settings.effectScale === undefined) {
      settings.effectScale = 1;
      await settings.save();
    }
    console.log(`  effectScale: ${settings.effectScale}`);

    console.log('\nMigration complete!');
    console.log(`  CodeEffects: ${await CodeEffect.countDocuments()} total`);
    console.log(`  Codes: ${await Code.countDocuments()} total`);

    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
