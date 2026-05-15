# Rembrandt readability patch

## What this fixes

Two related problems in the current readability output:

1. The line "GDS guidance is around grade 9" is wrong. GDS-trained content designers work to grade 8 because that is what Hemingway and similar tools surface. The "reading age 9" framing comes from the literal GDS phrasing but is not the working target.
2. The reading age value is being estimated by Sonnet rather than calculated. Large language models cannot reliably compute Flesch-Kincaid grade, so the number is approximate at best and inconsistent at worst.

This patch fixes both. The labelling and target are corrected, and a deterministic Flesch-Kincaid calculation replaces the model's estimate.

## Files affected

- `src/lib/flesch-kincaid.js` (new file — provided alongside this patch)
- `src/App.jsx` (two changes)
- `api/review.js` (one change to the system prompt)

---

## Change 1 — add the new utility file

Drop `flesch-kincaid.js` into `src/lib/`. If you do not already have a `lib` directory under `src/`, create one. The file is self-contained and does not need any wiring beyond the import in Change 2.

---

## Change 2 — replace `getReadingAgeContext` in `src/App.jsx`

Locate the existing `getReadingAgeContext` function in `src/App.jsx`. It currently uses target = 9 for service content. Replace the entire function with this version:

```js
const getReadingAgeContext = (readingAge, contentType) => {
  const t = (contentType || '').toLowerCase();

  let target = null;
  let modeName = null;
  let targetText = null;

  if (t.includes('crisis') || t.includes('emergency')) {
    target = 7;
    modeName = 'crisis or emergency content';
    targetText = 'aim for grade 7 or below (matches Hemingway scoring)';
  } else if (t.includes('service content')) {
    target = 8;
    modeName = 'service content';
    targetText = 'GDS guidance is around grade 8 (matches Hemingway scoring)';
  } else if (
    t.includes('fundraising') ||
    t.includes('emotional appeal') ||
    t.includes('appeal email') ||
    t.includes('donor')
  ) {
    target = 11;
    modeName = 'fundraising content';
    targetText = 'grade 9-11 is typical (matches Hemingway scoring)';
  } else if (
    t.includes('marketing') ||
    t.includes('commercial') ||
    t.includes('promotional')
  ) {
    target = 10;
    modeName = 'marketing content';
    targetText = 'grade 8-10 is typical (matches Hemingway scoring)';
  } else if (
    t.includes('organisational') ||
    t.includes('overview') ||
    t.includes('educational') ||
    t.includes('blog') ||
    t.includes('article') ||
    t.includes('explainer')
  ) {
    target = 12;
    modeName = 'content for engaged adult audiences';
    targetText = 'grade 9-12 is typical (matches Hemingway scoring)';
  }

  if (!target) return null;
  return {
    target,
    modeName,
    targetText,
    exceedsTarget: readingAge > target,
    isLivingExperience:
      modeName === 'service content' ||
      modeName === 'crisis or emergency content',
  };
};
```

What changed:

- Service content target moved from 9 to 8 (your GOV.UK working target).
- Crisis content target moved from 9 to 7. It cannot logically be higher than service content; crisis communication needs to be more accessible, not less.
- Every `targetText` now ends with "(matches Hemingway scoring)" so the user knows the number is comparable to the tool they already cross-check against.
- Terminology is consistently "grade" — no "reading age" references in the surfaced strings.

---

## Change 3 — wire in deterministic Flesch-Kincaid calculation in `src/App.jsx`

Add this import near the top of `src/App.jsx`, alongside the other imports:

```js
import { fleschKincaidGrade } from './lib/flesch-kincaid';
```

Then find the handler that receives the response from `/api/review` — it will look something like this:

```js
const data = await response.json();
setResults(data);
```

Replace it with:

```js
const data = await response.json();

// Override the model's estimated reading age with a real calculation.
// LLMs cannot reliably compute Flesch-Kincaid; this gives the user a number
// that matches Hemingway and is consistent across runs.
const calculatedGrade = fleschKincaidGrade(inputText);
if (calculatedGrade !== null && data.overall) {
  data.overall.readingAge = calculatedGrade;
}

setResults(data);
```

The variable name `inputText` is whatever you currently use for the text being reviewed — adjust the variable name if yours is different (it might be `text`, `content`, `userInput`, etc.).

---

## Change 4 — update the system prompt in `api/review.js`

Locate the section of the system prompt that instructs the model on the `readingAge` field. It currently tells the model to estimate a US grade-level reading age.

Replace that instruction with:

```
The readingAge field is calculated deterministically by the frontend using
the Flesch-Kincaid formula, which matches what Hemingway Editor and similar
tools surface. Return your best estimate for this field; the frontend will
override the value with the real calculation before display.

In your summary prose, when you reference the reading age, treat it as a
Flesch-Kincaid grade level. Do NOT use the phrase "reading age" — that
term refers to chronological comprehension age (e.g. "reading age 9" in
GDS literature) and is not interchangeable with Flesch-Kincaid grade.
Use "grade" consistently.

When you name a target, use these:
  - UK service content (GDS / GOV.UK): grade 8 or below
  - UK financial services (FCA contexts): grade 8-9 is practitioner consensus
  - UK crisis or emergency content: grade 7 or below
  - US federal content (Plain Writing Act): grade 8 or below
  - EU accessibility frameworks: no codified grade target; reference plain
    language principles instead
  - Fundraising / marketing / organisational content: name the typical range
    only when the input exceeds grade 12

Always state that the grade matches Hemingway scoring when you reference it,
so the reader knows the number is comparable to the tool they likely already
use.
```

If the existing prompt has more than one place where reading age is referenced (the JSON schema, the assessment criteria section, the output format examples), make sure every mention uses "grade" rather than "reading age" and references Hemingway compatibility.

---

## Test after deploying

Three quick checks on the Vercel preview URL before pointing rembrandtapp.com at it:

1. Run the HMRC letter through. The reading age line should say "Flesch-Kincaid grade X — for service content, GDS guidance is around grade 8 (matches Hemingway scoring)". The grade itself should be a stable number across runs (it was not before).
2. Run a short, simple paragraph through. The deterministic calculation should return a low grade (4-6) where the model previously may have over-estimated.
3. Open the same input in Hemingway Editor and compare the grade. They will not be identical to the decimal (Hemingway uses a related but distinct formula), but should be within one grade of each other. If they are wildly different, something has gone wrong with the wiring.

---

## What this does not fix

The system prompt almost certainly has other places where readability and reading age are referenced — the JSON schema definition, the assessment criteria, possibly the output format examples. This patch updates the canonical instruction, but you may want to do a search-and-replace in `api/review.js` for the string "reading age" and review each hit.

If you paste the current `api/review.js` and `src/App.jsx` into a new conversation, I can produce true drop-in file replacements with all references updated consistently in one pass. For now this patch fixes the primary bug and the calculation accuracy issue.
