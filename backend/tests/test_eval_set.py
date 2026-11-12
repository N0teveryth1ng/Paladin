"""The evaluation set satisfies the step 2 rules and the leak guard."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pytest

from app.eval.models import EvalSet, EvalPrompt
from app.eval.predicates import COMPONENT_TYPE_LABELS, parse

EVAL_SET_PATH = Path(__file__).resolve().parents[2] / "eval" / "eval_set.json"

STANDARD_HUMAN_STATEMENT = (
    "Every technology label names a real product that fits its component type."
)


@pytest.fixture(scope="module")
def raw_bytes() -> bytes:
    return EVAL_SET_PATH.read_bytes()


@pytest.fixture(scope="module")
def eval_set(raw_bytes: bytes) -> EvalSet:
    return EvalSet.model_validate(json.loads(raw_bytes.decode("utf-8")))


def _all_items(prompt: EvalPrompt):
    return [*prompt.must_include, *prompt.must_not_include]


# 1 ---------------------------------------------------------------------
def test_eval_set_loads_and_validates(eval_set: EvalSet) -> None:
    assert isinstance(eval_set, EvalSet)
    assert eval_set.eval_set_version == "1.0"


# 2 ---------------------------------------------------------------------
def test_exactly_fifteen_sequential_unique_ids(eval_set: EvalSet) -> None:
    ids = [prompt.id for prompt in eval_set.prompts]

    assert len(ids) == 15
    assert ids == [f"ev_{number:02d}" for number in range(1, 16)]
    assert len(set(ids)) == 15


# 3 ---------------------------------------------------------------------
def test_category_distribution(eval_set: EvalSet) -> None:
    counts = Counter(prompt.category for prompt in eval_set.prompts)

    assert counts == {"simple": 4, "medium": 4, "complex": 4, "adversarial": 3}


# 4 ---------------------------------------------------------------------
def test_adversarial_kinds_are_exactly_one_each(eval_set: EvalSet) -> None:
    adversarial = [p for p in eval_set.prompts if p.category == "adversarial"]
    kinds = Counter(prompt.adversarial_kind for prompt in adversarial)

    assert kinds == {"contradiction": 1, "vague": 1, "impossible": 1}
    assert all(
        prompt.adversarial_kind is None
        for prompt in eval_set.prompts
        if prompt.category != "adversarial"
    )


# 5 ---------------------------------------------------------------------
def test_rubric_minimums(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        assert len(prompt.must_include) >= 3, prompt.id
        assert len(prompt.must_not_include) >= 2, prompt.id


# 6 ---------------------------------------------------------------------
def test_predicates_parse_and_human_items_are_present(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        items = _all_items(prompt)

        for item in items:
            if item.check == "deterministic":
                assert item.predicate is not None, (prompt.id, item.id)
                parse(item.predicate)
            else:
                assert item.predicate is None, (prompt.id, item.id)

        humans = [item for item in items if item.check == "human"]
        assert humans, f"{prompt.id} has no human item"
        assert len(humans) <= 3, f"{prompt.id} has {len(humans)} human items"
        assert any(
            item.check == "human"
            and item.statement == STANDARD_HUMAN_STATEMENT
            for item in prompt.must_include
        ), f"{prompt.id} is missing the standard human item"


# 7 ---------------------------------------------------------------------
def test_blocking_flag_expectations(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        if prompt.category in {"simple", "medium", "complex"}:
            assert prompt.blocking_flag_expected == "forbidden", prompt.id
        elif prompt.adversarial_kind in {"contradiction", "impossible"}:
            assert prompt.blocking_flag_expected == "required", prompt.id
        else:
            assert prompt.blocking_flag_expected == "optional", prompt.id


# 8 ---------------------------------------------------------------------
def test_expected_assumptions_are_supplied(eval_set: EvalSet) -> None:
    vague = next(p for p in eval_set.prompts if p.adversarial_kind == "vague")

    assert len(vague.expected_assumptions) >= 2
    for prompt in eval_set.prompts:
        assert all(text.strip() for text in prompt.expected_assumptions), prompt.id
        if prompt.notes and "assumption" in prompt.notes.lower():
            assert prompt.expected_assumptions, prompt.id


# 9 ---------------------------------------------------------------------
def test_prompt_texts_are_unique_non_empty_and_short(eval_set: EvalSet) -> None:
    texts = [prompt.prompt for prompt in eval_set.prompts]

    assert len(set(texts)) == 15
    for prompt in eval_set.prompts:
        assert prompt.prompt.strip(), prompt.id
        assert len(prompt.prompt) <= 1200, prompt.id


# 10 --------------------------------------------------------------------
def _forbidden_prompt_strings(prompt: EvalPrompt) -> set[str]:
    forbidden: set[str] = set()

    for item in _all_items(prompt):
        if item.check != "deterministic":
            continue
        predicate = parse(item.predicate)
        for argument in predicate.arguments:
            if argument.name == "technology" and argument.operator == "~=":
                forbidden.add(argument.value)
            elif argument.name in {"from_type", "to_type", "member_type"}:
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])
            elif argument.name == "type" and predicate.function != "connection_exists":
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])

    return forbidden


def test_prompt_text_does_not_leak_its_own_rubric_vocabulary(
    eval_set: EvalSet,
) -> None:
    for prompt in eval_set.prompts:
        for forbidden in _forbidden_prompt_strings(prompt):
            pattern = rf"\b{re.escape(forbidden)}\b"
            assert re.search(pattern, prompt.prompt, re.IGNORECASE) is None, (
                prompt.id,
                forbidden,
            )


# 11 --------------------------------------------------------------------
def test_eval_set_is_byte_stable(eval_set: EvalSet, raw_bytes: bytes) -> None:
    redumped = json.dumps(
        eval_set.model_dump(mode="json"), indent=2, ensure_ascii=False
    ) + "\n"

    assert redumped.encode("utf-8") == raw_bytes
