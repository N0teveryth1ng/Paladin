# Scratch Set

`scratch_prompts.json` holds 5 prompts that are **not** in the evaluation set and
are not scored. They exist to choose three things before the harness is frozen:

1. the response mode per model (`json_schema` or `schema_in_prompt`);
2. `max_tokens`, from measured output with at least 2x headroom;
3. the wording of `prompts/system/architecture-v1.md`.

Rules:

- Scratch runs are never counted, never reported as results, and never read by
  `app.eval.runner`. A test enforces the last rule.
- No scratch prompt may paraphrase an evaluation prompt. An 8-word shingle test
  against `eval/eval_set.json` enforces this.
- Tuning the system prompt on a scratch prompt is allowed. Tuning it after any
  scored run is not: that creates a new version and a full rerun of every model.

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.llm.scratch_runner --model <model> --mode json_schema
.\.venv\Scripts\python.exe -m app.llm.scratch_runner --model <model> --mode schema_in_prompt
```

Outputs land in `scratch/runs/`, which is git-ignored.
