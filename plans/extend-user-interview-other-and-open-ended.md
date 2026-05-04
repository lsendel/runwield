---
classification: "FEATURE"
complexity: "LOW"
summary: "Enhance the `user_interview` tool to support open-ended responses in multiple-choice and yes/no questions. This involves adding an `allowOther` boolean to `multipleChoiceQuestionSchema` and `yesNoQuestionSchema`, updating the validation and execution logic to handle \"Other\" responses, and ensuring the existing `text` question type is clearly positioned as the primary open-ended option."
affectedPaths:
    - "src/tools/user-interview.js"
createdAt: "2026-05-04T00:00:00.000Z"
updatedAt: "2026-05-04T14:59:38.777Z"
status: "approved"
origin: "triage"
---

# Extend user_interview: allowOther support for yes/no and multiple choice

## Context

The request is to support open-ended responses for `yes_no` and `multiple_choice` via an optional `allowOther` flag in
`src/tools/user-interview.js`, while clearly preserving `text` as the primary fully open-ended question type.

## Objective

Implement `allowOther` for `yes_no` and `multiple_choice` questions so users can choose an explicit “Other” branch and
provide typed input, with safe validation and backward-compatible behavior for existing question flows.

## Approach

- Add `allowOther?: boolean` to yes/no and multiple-choice schemas and typedefs.
- Keep `text` as the only open-ended question type (no new type alias).
- Reuse existing prompt/validation patterns (`promptSelect`, `promptText`, trim/empty handling).
- Return explicit structured output for “Other” answers using a reserved sentinel + `otherText`.

## Files to Modify

- `src/tools/user-interview.js` — schema, typedefs, batch validation, question execution logic, and tool
  description/prompt snippet.
- `src/tools/__tests__/user-interview_test.js` — coverage for `allowOther`, cancel/error branches, and regressions.

## Reuse Opportunities

Existing functions, modules, or patterns to reuse:

- `src/tools/user-interview.js` `validateBatch()` — extend current ID/default/choice validation patterns.
- `src/tools/user-interview.js` text branch in `askQuestion()` — reuse text normalization and empty-answer semantics for
  `otherText`.
- `src/tools/user-interview.js` result assembly in `execute()` — preserve status/metadata behavior while extending
  answer payload shape.

## Implementation Steps

- [ ] Step 1: Extend question schemas/types
  - Add optional `allowOther` to `yesNoQuestionSchema` and `multipleChoiceQuestionSchema`.
  - Update JSDoc question typedefs and answer typedef comments to document `otherText` when applicable.

- [ ] Step 2: Define and enforce an internal Other sentinel
  - Introduce a single internal constant (e.g., `OTHER_VALUE = "other"`).
  - In `validateBatch()`, reject multiple-choice questions where a user choice value collides with that sentinel when
    `allowOther` is enabled.

- [ ] Step 3: Implement `allowOther` for yes/no flow
  - In `askQuestion()` for `yes_no`, append “Other” as a selectable option only when `allowOther` is true.
  - If selected, ask follow-up freeform text prompt.
  - Enforce non-empty trimmed input using existing text semantics.
  - Return structured value using sentinel + `otherText`; keep existing boolean returns for yes/no selections.

- [ ] Step 4: Implement `allowOther` for multiple-choice flow
  - Append “Other” option only when `allowOther` is true.
  - On Other selection, collect follow-up text with same normalization/validation approach.
  - Return structured value using sentinel + `otherText`; keep current behavior for predefined choices.

- [ ] Step 5: Update answer assembly typing/shape safely
  - Extend pushed answer objects in `execute()` to carry optional `otherText`.
  - Keep existing fields (`index`, `id`, `type`, `prompt`, `value`, `valueLabel`) unchanged for non-Other paths.

- [ ] Step 6: Update tool guidance text
  - Adjust `description` and `promptSnippet` to mention `allowOther` as optional for yes/no and multiple-choice.
  - Explicitly keep `text` positioned as the canonical open-ended format.

- [ ] Step 7: Add and update tests
  - Add yes/no `allowOther` success case (Other selected with follow-up text).
  - Add multiple-choice `allowOther` success case.
  - Add cancel-at-follow-up-text and empty-follow-up-text validation cases.
  - Add validation test for sentinel collision in choices when `allowOther` is true.
  - Ensure existing tests still pass unchanged for non-Other flows.

## Verification Plan

- Automated:
  - `deno test src/tools/__tests__/user-interview_test.js`
  - `deno run ci`
- Manual:
  - Run a yes/no question with `allowOther: true`, choose Other, provide text.
  - Run a multiple-choice question with `allowOther: true`, choose predefined option.
  - Run a multiple-choice question with `allowOther: true`, choose Other, then cancel.
- Expected results:
  - Other branches return structured output including `otherText`.
  - Empty Other text produces `validation_error` with `EMPTY_ANSWER` semantics.
  - Cancel behavior remains `status: "canceled"` with correct `canceledAt`/counts.
  - Legacy yes/no, text, and multiple-choice behavior remains intact.

## Edge Cases & Considerations

- Backward compatibility: existing yes/no answers remain boolean unless Other is chosen.
- Sentinel collision risk: explicitly validate to prevent ambiguous values.
- Follow-up prompt wording should be clear and cancellable.
- Assumption used for finalization: keep `text` as the only open-ended type and use sentinel + `otherText` for Other
  responses.
