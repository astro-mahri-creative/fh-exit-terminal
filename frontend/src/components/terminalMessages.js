// Randomized in-character copy for the code entry screen's two interruption
// dialogs. Both pools are drawn through pickMessage so the same line never
// lands twice in a row — repetition is what makes a bit stop being a bit.

// Shown when someone tries the PHAX easter egg.
export const PHAX_MESSAGES = [
  'Plz don\'t make it weird.',
  'Not today (and probably not tomorrow).',
  'PHAX says hi 👋',
  'Access DENIED. jkjk',
  'You wish it was that easy 😏',
  'Ha! Good one.',
  'Don\'t worry, you\'re not the only one who tried it.',
  'That\'s classified 🤫',
  'Absolutely not lol',
  'Caught you 👀',
];

// Shown when a code isn't recognized. Deliberately warm and deliberately
// useless: no hints, nothing to reverse-engineer, just enough encouragement
// that a wrong guess feels like part of the game instead of a wall. The real
// reason (unrecognized / already used / etc.) is shown underneath in small
// type, so these never have to carry information.
export const INVALID_CODE_MESSAGES = [
  'Not that one. But the energy was right.',
  'The terminal appreciates the effort.',
  'Close enough to be interesting. Not close enough to work.',
  'A bold guess. Genuinely.',
  'That code exists somewhere. Not here.',
  'Rejected — respectfully.',
  'Keep going. Statistically, you\'re getting warmer.',
  'The multiverse admires your persistence.',
  'Nope. But confidently nope.',
  'Wrong in a very promising way.',
  'Filed under: almost.',
  'Denied, but we\'re rooting for you.',
  'Four characters. Infinite possibilities. Not this one.',
  'The signature didn\'t take. Try another.',
  'Somewhere, a version of you got that right.',
  'Not a match. Still a valiant attempt.',
  'That one\'s not in the system. Yet.',
  'Good instinct. Wrong sequence.',
];

// Headline above the message. Kept short and terminal-flavored so the dialog
// reads as system output, not a scolding. Split by cause so the headline never
// contradicts the reason printed beneath it: a code that was already used is
// recognized, it just can't be used twice.
export const INVALID_CODE_HEADLINES = [
  'SIGNATURE NOT RECOGNIZED',
  'NO MATCH IN REGISTRY',
  'TRANSMISSION REJECTED',
  'CODE UNVERIFIED',
];

export const DUPLICATE_CODE_HEADLINES = [
  'CODE ALREADY LOGGED',
  'SIGNATURE ALREADY ON FILE',
  'DUPLICATE SIGNATURE',
];

/**
 * Pick a random entry, avoiding `previous` when the pool is big enough to
 * make that possible.
 */
export function pickMessage(pool, previous = null) {
  if (!pool || pool.length === 0) return '';
  if (pool.length === 1) return pool[0];
  const candidates = previous ? pool.filter(m => m !== previous) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
