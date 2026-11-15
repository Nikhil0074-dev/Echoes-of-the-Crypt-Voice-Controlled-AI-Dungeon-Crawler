const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30
};

/** Lower-cases, strips punctuation, converts number words and common speech-recognition slips. */
export function normalizeText(input: string): string {
  let t = ` ${input.toLowerCase()} `;
  t = t.replace(/[’‘]/g, "'").replace(/[.!?"“”:]/g, ' ');
  t = t.replace(/\b(to|too)\s+(steps?|tiles?|squares?|spaces?)\b/g, '2 $2');
  t = t.replace(/\ba couple of\b/g, '2').replace(/\ba few\b/g, '3');
  t = t.replace(/\btwice\b/g, '2 times').replace(/\bthrice\b/g, '3 times').replace(/\bonce\b/g, '1 times');
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\b/g,
    w => String(NUMBER_WORDS[w]));
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Removes polite or filler prefixes that carry no game meaning. */
export function stripFiller(text: string): string {
  return text
    .replace(/^(hey|ok|okay|yo)\s+(dungeon|game|oracle|hero)\s*,?\s*/i, '')
    .replace(/^(please|can you|could you|would you|i want you to|i want to|i would like to|i'd like to|let's|lets|i wanna|go ahead and)\s+/i, '')
    .replace(/\bplease\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
