# Evaluation Set Changelog

The set is frozen when step 2 is approved. Every later change is recorded here
with its reason and the evidence that forced it.

## 1.0 — 12 November 2026 — initial set, frozen on approval

- 15 prompts: 4 simple, 4 medium, 4 complex, 3 adversarial
  (1 contradiction, 1 vague, 1 impossible).
- Rubrics written from the failure definitions in project document §5, not
  from any model output.
- Deterministic predicates use the step 2 grammar; human items are capped at 3
  per prompt and include the fixed technology-realism item.
- Blocking-flag expectations: forbidden for clean prompts, required for the
  contradiction and impossible prompts, optional for the vague prompt.
- Prompt 11 forbids deriving exactly-once effects from the delivery mechanism
  alone.
- Pass protocol: 3 runs per prompt per model; 2-of-3 deterministic gate;
  set bar 13/15 prompts, all complex, all adversarial, 41/45 first-attempt
  schema-valid.
