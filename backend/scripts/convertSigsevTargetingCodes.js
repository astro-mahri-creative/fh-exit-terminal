/*
 * Convert the two post-launch SIGSEV codes from plain amplifiers to
 * goal-relative targeting codes.
 *
 *   WVFM  ×1.15 amplify  ->  ±250 standard, nearest_goal   (polarizing)
 *   DSGF  ×1.40 amplify  ->  ±500 standard, furthest_goal  (equalizing)
 *
 * Each gets a SYMMETRIC PAIR of effect rows — one negative, one positive, same
 * magnitude, same mode. The sign routes an effect to a bucket, so a pair lets a
 * faction-neutral SIGSEV code act on whichever option the player picks without
 * favoring either. FAES already sets the precedent for one code carrying two
 * effect rows.
 *
 * Balance: this drops the amplifier stacking ceiling from
 *   1.3 × 2.5 × 2.4 × 1.2 × 1.4 × 1.15 ≈ 15.1×  to  1.3 × 2.5 × 2.4 × 1.2 ≈ 9.4×
 * Nine sessions in the history have already collected every amplifier-bearing
 * code, so that ceiling was reachable in practice.
 *
 * IMPORTANT — run this only AFTER the backend carrying the nearest_goal /
 * furthest_goal support is deployed. Against an older backend the new
 * targetMode values fall through to the 'specific' branch, find no universeId,
 * and the codes go silently inert.
 *
 * Usage (from backend/):
 *   node scripts/convertSigsevTargetingCodes.js            # dry run, prints the plan
 *   node scripts/convertSigsevTargetingCodes.js --apply    # write
 *   node scripts/convertSigsevTargetingCodes.js --revert --apply   # back to amplifiers
 *
 * Touches only the CodeEffect rows of WVFM and DSGF. Idempotent either way.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Code, CodeEffect, AdminSettings } = require('../models');

const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');

const TARGETING = {
  WVFM: { magnitude: 250, targetMode: 'nearest_goal' },
  DSGF: { magnitude: 500, targetMode: 'furthest_goal' },
};
const AMPLIFY = {
  WVFM: { effectValue: 1.15 },
  DSGF: { effectValue: 1.4 },
};

function describe(e) {
  return `val=${e.effectValue} type=${e.effectType} mode=${e.targetMode}`;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const settings = await AdminSettings.getSettings();
  const scale = settings.effectScale || 1;
  console.log(`live effectScale = ×${scale}`);
  console.log(REVERT ? 'MODE: revert to amplifiers' : 'MODE: convert to goal targeting');
  console.log(APPLY ? 'WRITING to the database\n' : 'DRY RUN — pass --apply to write\n');

  for (const codeStr of Object.keys(TARGETING)) {
    const code = await Code.findOne({ code: codeStr });
    if (!code) {
      console.log(`${codeStr}: NOT FOUND — skipping`);
      continue;
    }
    const existing = await CodeEffect.find({ codeId: code._id });
    console.log(`${codeStr} (tier ${code.tier}, ${code.alignment})`);
    existing.forEach(e => console.log(`  before: ${describe(e)}`));

    const desired = REVERT
      ? [{ effectValue: AMPLIFY[codeStr].effectValue, effectType: 'amplify', targetMode: 'all' }]
      : [
          { effectValue: -TARGETING[codeStr].magnitude, effectType: 'standard', targetMode: TARGETING[codeStr].targetMode },
          { effectValue: TARGETING[codeStr].magnitude, effectType: 'standard', targetMode: TARGETING[codeStr].targetMode },
        ];

    const matches = existing.length === desired.length && desired.every(d =>
      existing.some(e => e.effectValue === d.effectValue && e.effectType === d.effectType && e.targetMode === d.targetMode));
    if (matches) {
      console.log('  already in the desired state — nothing to do\n');
      continue;
    }

    desired.forEach(d => {
      const runtime = d.effectType === 'standard'
        ? `  (runtime ${Math.floor(d.effectValue * 1 * scale)} at tier multiplier ×1, effectScale ×${scale})`
        : '';
      console.log(`  after:  ${describe(d)}${runtime}`);
    });

    if (APPLY) {
      await CodeEffect.deleteMany({ codeId: code._id });
      for (const d of desired) {
        await CodeEffect.create({ codeId: code._id, universeId: null, isPostCure: false, ...d });
      }
      console.log('  written');
    }
    console.log('');
  }

  // Report the resulting amplifier ceiling so the balance shift is visible.
  // On a dry run the DB still holds the old rows, so project the outcome:
  // every amplify row NOT belonging to WVFM/DSGF, times whatever the two
  // codes will hold afterwards.
  const touched = await Code.find({ code: { $in: Object.keys(TARGETING) } }).select('_id');
  const touchedIds = touched.map(c => String(c._id));
  const untouched = (await CodeEffect.find({ effectType: 'amplify' }))
    .filter(e => !touchedIds.includes(String(e.codeId)));
  const projected = REVERT ? Object.values(AMPLIFY).map(a => a.effectValue) : [];
  const rows = [...untouched.map(e => e.effectValue), ...projected];
  const ceiling = rows.reduce((acc, v) => acc * v, 1);
  console.log(`amplifier stacking ceiling ${APPLY ? 'is now' : 'would become'} ×${ceiling.toFixed(1)} ` +
    `(${rows.length} amplify rows)`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
