---
name: pr-review
description: "Use when reviewing a pull request or code change for bugs, regressions, missing tests, risks, and correctness issues."
---

# Pull Request Review

Use this skill when the user wants a code review that prioritizes findings, behavioral risks, and missing validation.

## Goal

Produce a focused review that identifies concrete issues first, then summarizes the overall change if needed.

## Workflow

1. Classify the review scope.
   - Decide whether the request is a quick sanity check, a full review, or a targeted review of a specific file or behavior.
   - Identify the primary area of risk if it is obvious: correctness, security, performance, compatibility, maintainability, or tests.

2. Gather the minimum evidence needed.
   - Inspect the diff, nearby implementation, and any related tests or logs.
   - Prefer concrete behavior, control flow, and data flow over broad repository exploration.
   - If the review depends on missing context, ask targeted questions before speculating.

3. Review for actionable findings.
   - Look for bugs, regressions, incorrect assumptions, edge cases, missing validation, and unsafe changes.
   - Prioritize issues by severity and user impact.
   - Distinguish verified findings from hypotheses.
   - If no issues are found, say that explicitly and note any residual risk or testing gap.

4. Validate the review when possible.
   - Run the narrowest relevant test, build, lint, or typecheck command for the touched slice.
   - If a cheap focused check can falsify a concern, do that before widening scope.
   - If validation is not possible, state the limitation clearly.

5. Report findings first.
   - Lead with the highest-severity issues.
   - Include file and line references where possible.
   - Explain why each issue matters and what would make it safe.
   - Keep the summary brief and secondary to the findings.

## Quality Check

Before finishing, confirm that the review:

- Starts with findings, ordered by severity.
- Uses concrete evidence from the diff or nearby code.
- Calls out missing tests, regressions, or risky assumptions.
- Separates facts from speculation.
- States clearly when there are no findings.

## Output Format

When responding, prefer this order:

1. Findings, with file and line references if available
2. Open questions or assumptions, if any
3. Short summary of the overall change or review outcome
4. Any validation performed or gaps that remain