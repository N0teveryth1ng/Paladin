"""Pydantic models for the evaluation set.

The evaluation set is data, not code. These models are the contract that
``eval/eval_set.json`` must satisfy. Predicate syntax is validated separately
by ``app.eval.predicates``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RubricItem(BaseModel):
    """One pass/fail condition in a prompt's rubric."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    check: Literal["deterministic", "human"]
    predicate: str | None = None

    @model_validator(mode="after")
    def _predicate_matches_check(self) -> "RubricItem":
        if self.check == "deterministic" and self.predicate is None:
            raise ValueError("a deterministic item requires a predicate")
        if self.check == "human" and self.predicate is not None:
            raise ValueError("a human item must not have a predicate")
        return self


class EvalPrompt(BaseModel):
    """One evaluation prompt and everything needed to score it."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^ev_\d{2}$")
    title: str = Field(min_length=1)
    category: Literal["simple", "medium", "complex", "adversarial"]
    adversarial_kind: Literal["contradiction", "vague", "impossible"] | None = None
    prompt: str = Field(min_length=1)
    expected_requirements: list[str]
    must_include: list[RubricItem]
    must_not_include: list[RubricItem]
    blocking_flag_expected: Literal["required", "forbidden", "optional"]
    expected_assumptions: list[str] = Field(default_factory=list)
    notes: str | None = None


class EvalSet(BaseModel):
    """The whole evaluation set, versioned so later changes are explicit."""

    model_config = ConfigDict(extra="forbid")

    eval_set_version: Literal["1.0"]
    prompts: list[EvalPrompt]
