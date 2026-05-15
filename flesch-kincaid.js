// =============================================================================
// Flesch-Kincaid Grade Level — deterministic readability calculation
//
// Why this exists
//   Large language models do not reliably compute Flesch-Kincaid grade. The
//   number Sonnet returns in the readingAge field is closer to a vibe than a
//   measurement, and the same passage can score differently from one run to
//   the next. The F-K formula is straightforward (words, sentences,
//   syllables) and should be calculated in code, then displayed as the
//   authoritative number.
//
//   The grade returned here is comparable to what Hemingway Editor and
//   similar tools report. UK content designers cross-check drafts against
//   these tools at the keyboard, so this is the number they will recognise.
//
// Formula
//   0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
//
// Usage
//   import { fleschKincaidGrade } from './lib/flesch-kincaid';
//   const grade = fleschKincaidGrade(inputText);  // returns integer, or null
// =============================================================================

const countSentences = (text) => {
  const sentences = text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Math.max(sentences.length, 1);
};

const countWords = (text) => {
  const words = text.match(/\b[\w'-]+\b/g) || [];
  return words.length;
};

// Syllable counting is an approximation — English orthography defeats any
// simple rule — but it is consistent with the approach used by readability
// tools including Hemingway. Errors tend to average out across a passage.
const countSyllablesInWord = (word) => {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;

  // Remove silent e endings and leading y
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
};

const countSyllables = (text) => {
  const words = text.match(/\b[\w'-]+\b/g) || [];
  return words.reduce((sum, word) => sum + countSyllablesInWord(word), 0);
};

export const fleschKincaidGrade = (text) => {
  if (!text || text.trim().length === 0) return null;

  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);

  if (words === 0) return null;

  const grade =
    0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;

  // Floor at grade 1; round to nearest integer to match Hemingway-style display
  return Math.max(1, Math.round(grade));
};
