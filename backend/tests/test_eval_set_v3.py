"""Structural validation and authoring-independence checks for eval set v3.0."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pytest

from app.eval.models import EvalPrompt, EvalSet
from app.eval.predicates import COMPONENT_TYPE_LABELS, parse

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_SET_V3_PATH = REPO_ROOT / "eval" / "eval_set_v3.json"
EVAL_SET_V2_PATH = REPO_ROOT / "eval" / "eval_set_v2.json"
EVAL_SET_V1_PATH = REPO_ROOT / "eval" / "eval_set.json"
SCRATCH_PATH = REPO_ROOT / "scratch" / "scratch_prompts.json"

STANDARD_HUMAN_STATEMENT = (
    "Every technology label names a real product that fits its component type."
)
SHINGLE_SIZE = 8


@pytest.fixture(scope="module")
def raw_bytes() -> bytes:
    return EVAL_SET_V3_PATH.read_bytes()


@pytest.fixture(scope="module")
def eval_set(raw_bytes: bytes) -> EvalSet:
    return EvalSet.model_validate(json.loads(raw_bytes.decode("utf-8")))


def _all_items(prompt: EvalPrompt):
    return [*prompt.must_include, *prompt.must_not_include]


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _shingles(text: str) -> set[tuple[str, ...]]:
    parts = _words(text)
    return {
        tuple(parts[index : index + SHINGLE_SIZE])
        for index in range(len(parts) - SHINGLE_SIZE + 1)
    }


def _forbidden_prompt_strings(prompt: EvalPrompt) -> set[str]:
    """Technology and component-type names used by this prompt's predicates."""

    forbidden: set[str] = set()
    for item in _all_items(prompt):
        if item.check != "deterministic":
            continue
        assert item.predicate is not None
        predicate = parse(item.predicate)
        for argument in predicate.arguments:
            if argument.name == "technology" and argument.operator == "~=":
                forbidden.add(argument.value)
            elif argument.name in {"from_type", "to_type", "member_type"}:
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])
            elif argument.name == "type" and predicate.function != "connection_exists":
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])
    return forbidden


def test_eval_set_loads_as_version_3(eval_set: EvalSet) -> None:
    assert eval_set.eval_set_version == "3.0"


def test_exactly_fifteen_sequential_unique_ids(eval_set: EvalSet) -> None:
    ids = [prompt.id for prompt in eval_set.prompts]
    assert len(ids) == 15
    assert ids == [f"ev3_{number:02d}" for number in range(1, 16)]
    assert len(set(ids)) == 15


def test_category_distribution(eval_set: EvalSet) -> None:
    counts = Counter(prompt.category for prompt in eval_set.prompts)
    assert counts == {"simple": 4, "medium": 4, "complex": 4, "adversarial": 3}


def test_adversarial_kinds_are_exactly_one_each(eval_set: EvalSet) -> None:
    adversarial = [p for p in eval_set.prompts if p.category == "adversarial"]
    assert Counter(p.adversarial_kind for p in adversarial) == {
        "contradiction": 1,
        "vague": 1,
        "impossible": 1,
    }
    assert all(
        prompt.adversarial_kind is None
        for prompt in eval_set.prompts
        if prompt.category != "adversarial"
    )


def test_rubric_minimums(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        assert len(prompt.must_include) >= 3, prompt.id
        assert len(prompt.must_not_include) >= 2, prompt.id


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
            item.check == "human" and item.statement == STANDARD_HUMAN_STATEMENT
            for item in prompt.must_include
        ), f"{prompt.id} is missing the standard human item"


def test_blocking_flag_matrix(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        if prompt.category in {"simple", "medium", "complex"}:
            assert prompt.blocking_flag_expected == "forbidden", prompt.id
        elif prompt.adversarial_kind in {"contradiction", "impossible"}:
            assert prompt.blocking_flag_expected == "required", prompt.id
        else:
            assert prompt.blocking_flag_expected == "optional", prompt.id


def test_expected_assumptions_are_supplied(eval_set: EvalSet) -> None:
    vague = next(p for p in eval_set.prompts if p.adversarial_kind == "vague")
    assert len(vague.expected_assumptions) >= 2
    for prompt in eval_set.prompts:
        assert all(text.strip() for text in prompt.expected_assumptions), prompt.id
        if prompt.notes and "assumption" in prompt.notes.lower():
            assert prompt.expected_assumptions, prompt.id


def test_prompt_texts_are_unique_non_empty_and_short(eval_set: EvalSet) -> None:
    texts = [prompt.prompt for prompt in eval_set.prompts]
    assert len(set(texts)) == 15
    for prompt in eval_set.prompts:
        assert prompt.prompt.strip(), prompt.id
        assert len(prompt.prompt) <= 1200, prompt.id


def test_prompt_text_does_not_leak_its_own_predicate_vocabulary(
    eval_set: EvalSet,
) -> None:
    for prompt in eval_set.prompts:
        for forbidden in _forbidden_prompt_strings(prompt):
            pattern = rf"\b{re.escape(forbidden)}\b"
            assert re.search(pattern, prompt.prompt, re.IGNORECASE) is None, (
                prompt.id,
                forbidden,
            )


def test_no_eight_word_shingle_is_shared_with_v1_v2_or_scratch(
    eval_set: EvalSet,
) -> None:
    v1 = json.loads(EVAL_SET_V1_PATH.read_text(encoding="utf-8"))
    v2 = json.loads(EVAL_SET_V2_PATH.read_text(encoding="utf-8"))
    scratch = json.loads(SCRATCH_PATH.read_text(encoding="utf-8"))
    other = [(entry["id"], entry["prompt"]) for entry in v1["prompts"]]
    other += [(entry["id"], entry["prompt"]) for entry in v2["prompts"]]
    other += [(entry["id"], entry["prompt"]) for entry in scratch]

    for prompt in eval_set.prompts:
        mine = _shingles(prompt.prompt)
        for other_id, other_text in other:
            assert not (mine & _shingles(other_text)), (prompt.id, other_id)


def test_component_count_is_only_on_the_vague_prompt(eval_set: EvalSet) -> None:
    limited: list[str] = []
    for prompt in eval_set.prompts:
        for item in _all_items(prompt):
            if item.check == "deterministic" and item.predicate:
                if parse(item.predicate).function == "component_count":
                    limited.append(prompt.id)
    assert limited == ["ev3_14"]
    vague = next(p for p in eval_set.prompts if p.id == "ev3_14")
    assert vague.notes and "component_count(lte=6)" in vague.notes
    assert "pre-registered" in vague.notes.lower()
    assert "not tuned after v3 results" in vague.notes.lower()


def test_assumption_present_only_on_ev3_14(eval_set: EvalSet) -> None:
    found: list[str] = []
    for prompt in eval_set.prompts:
        for item in _all_items(prompt):
            if item.check == "deterministic" and item.predicate:
                if parse(item.predicate).function == "assumption_present":
                    found.append(prompt.id)
                    assert item.predicate == 'assumption_present(text~="approv")', (
                        prompt.id,
                        item.predicate,
                    )
    assert found == ["ev3_14"]


def test_eval_set_is_byte_stable(eval_set: EvalSet, raw_bytes: bytes) -> None:
    redumped = json.dumps(
        eval_set.model_dump(mode="json"), indent=2, ensure_ascii=False
    ) + "\n"
    assert redumped.encode("utf-8") == raw_bytes
    assert hashlib.sha256(raw_bytes).hexdigest().upper() == (
        "7B46B89744C7CE26BFBFF616546D7A5EDCAF1ABE29B6D4ADB876BD69ACB66141"
    )


def test_ids_and_version_cannot_be_mixed() -> None:
    payload = json.loads(EVAL_SET_V3_PATH.read_text(encoding="utf-8"))
    payload["eval_set_version"] = "1.0"
    with pytest.raises(ValueError, match="does not match eval set version"):
        EvalSet.model_validate(payload)


def test_polarity_layout_is_explicit(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        all_items = _all_items(prompt)
        assert all(
            item.predicate is None or parse(item.predicate).function != "no_flag"
            for item in all_items
        ), prompt.id
        assert all(
            item.predicate is None or parse(item.predicate).function != "no_component"
            for item in all_items
        ), prompt.id

        include_functions = {
            parse(item.predicate).function
            for item in prompt.must_include
            if item.check == "deterministic" and item.predicate
        }
        assert "no_reference_issues" in include_functions, prompt.id
        assert "no_connection" in include_functions, prompt.id

        for item in prompt.must_not_include:
            if item.check == "deterministic":
                assert item.predicate is not None, (prompt.id, item.id)
                assert parse(item.predicate).function == "component_exists", (
                    prompt.id,
                    item.id,
                )


def test_ev3_13_reviewer_prompt_and_blocking_rule(eval_set: EvalSet) -> None:
    prompt = next(p for p in eval_set.prompts if p.id == "ev3_13")
    assert prompt.prompt == (
        "Design a message-delivery system with this requirement: "
        '"A message must be delivered exactly once. The sender may never store a copy, '
        'and the receiver may be offline for days." Deliver a design.'
    )
    assert prompt.blocking_flag_expected == "required"
    assert prompt.adversarial_kind == "contradiction"
    assert any(
        item.check == "deterministic"
        and item.predicate
        and parse(item.predicate).function == "flag_present"
        for item in prompt.must_include
    )
    assert prompt.notes and "reviewer" in prompt.notes.lower()


def test_ev3_11_contains_required_sentence(eval_set: EvalSet) -> None:
    prompt = next(p for p in eval_set.prompts if p.id == "ev3_11")
    required = (
        "Each shelter enforces its own bed capacity locally and syncs with the "
        "central office when connectivity returns."
    )
    assert required in prompt.prompt


def test_ev3_13_and_ev3_15_end_with_deliver_a_design(eval_set: EvalSet) -> None:
    for prompt_id in ("ev3_13", "ev3_15"):
        prompt = next(p for p in eval_set.prompts if p.id == prompt_id)
        assert prompt.prompt.rstrip().endswith("Deliver a design."), prompt_id


def test_no_nfr_justified_exclusions_on_sensitive_prompts(eval_set: EvalSet) -> None:
    sensitive = {"ev3_05", "ev3_08", "ev3_11", "ev3_12"}
    forbidden = {"message_queue", "cache", "load_balancer"}
    for prompt in eval_set.prompts:
        if prompt.id not in sensitive:
            continue
        for item in prompt.must_not_include:
            if item.check != "deterministic" or not item.predicate:
                continue
            predicate = parse(item.predicate)
            if predicate.function == "component_exists":
                ctype = predicate.arguments[0].value
                assert ctype not in forbidden, (prompt.id, ctype)


def test_every_must_not_deterministic_has_prompt_justified_note(
    eval_set: EvalSet,
) -> None:
    for prompt in eval_set.prompts:
        for item in prompt.must_not_include:
            if item.check != "deterministic":
                continue
            note = (prompt.notes or "").lower()
            assert "prompt text alone" in note or "justified" in note, (
                prompt.id,
                item.id,
            )
