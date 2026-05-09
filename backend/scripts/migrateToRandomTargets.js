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

    // 2. For RMPI/PRWC: delete duplicate rows (keep 1 per code)
    for (const codeName of ['RMPI', 'PRWC']) {
      const code = await Code.findOne({ code: codeName });
      if (!code) continue;
      const effects = await CodeEffect.find({ codeId: code._id }).sort({ _id: 1 });
      if (effects.length > 1) {
        const idsToDelete = effects.slice(1).map(e => e._id);
        await CodeEffect.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`  Removed ${idsToDelete.length} duplicate effects for ${codeName}`);
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

    // 5. Reset all universe currentCases to 50% of init and recalculate statuses
    console.log('Resetting universe cases to 50% of init...');
    const universes = await Universe.find();
    for (const universe of universes) {
      universe.currentCases = Math.floor(universe.initializationCases * 0.5);
      universe.status = calculateUniverseStatus(universe.currentCases, universe.initializationCases);
      universe.canSpread = universe.status === 'COMPROMISED';
      universe.lastUpdated = new Date();
      await universe.save();
      console.log(`  ${universe.name}: ${universe.currentCases} cases -> ${universe.status}`);
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
