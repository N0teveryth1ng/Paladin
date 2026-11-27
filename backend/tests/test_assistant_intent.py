from app.api.assistant import _normalize_response
from app.api.models import AssistantRequest


def _req(msg: str = "x"):
    return AssistantRequest(message=msg, messages=[], current_architecture=None)


def test_review_with_ops_preserved():
    raw = {
        "kind": "review",
        "reply": "Found issues",
        "operations": [{"op": "add_component", "id": None, "name": None, "summary": None, "component": {"id": "c1", "name": "WAF", "type": "api_gateway", "description": "waf", "requirement_refs": ["req_1"]}, "connection": None, "group": None, "patch": None, "operations": None}],
        "redesign_prompt": None,
    }
    res = _normalize_response(raw, _req("review this"))
    assert res.kind == "review"
    assert len(res.operations) == 1
    assert res.redesign_prompt is None


def test_small_edit_without_ops_falls_back_to_chat():
    raw = {"kind": "small_edit", "reply": "ok", "operations": [], "redesign_prompt": None}
    res = _normalize_response(raw, _req("rename"))
    assert res.kind == "chat"
    assert res.operations == []


def test_major_redesign_forces_prompt():
    raw = {"kind": "major_redesign", "reply": "redesign", "operations": [], "redesign_prompt": None}
    res = _normalize_response(raw, _req("build a different system"))
    assert res.kind == "major_redesign"
    assert res.redesign_prompt == "build a different system"
    assert res.operations == []
