"""Settings load from env/.env and never leak the key."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

import pytest

from app.llm.settings import (
    API_KEY_VAR,
    BASE_URL_VAR,
    MODEL_VAR,
    SettingsError,
    load_settings,
    read_dotenv,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SECRET = "sk-super-secret-value-123"


def _env(**overrides: str) -> dict[str, str]:
    base = {
        BASE_URL_VAR: "https://provider.test/v1",
        API_KEY_VAR: SECRET,
        MODEL_VAR: "test-model",
    }
    base.update(overrides)
    return base


def test_environment_wins_over_dotenv(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text(
        f"{BASE_URL_VAR}=https://dotenv.test/v1\n"
        f"{API_KEY_VAR}=dotenv-key\n"
        f"{MODEL_VAR}=dotenv-model\n",
        encoding="utf-8",
    )

    settings = load_settings(env=_env(), dotenv_path=dotenv)

    assert settings.base_url == "https://provider.test/v1"
    assert settings.api_key == SECRET
    assert settings.model == "test-model"


def test_dotenv_used_when_environment_is_empty(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text(
        f"{BASE_URL_VAR}=https://dotenv.test/v1\n"
        f"{API_KEY_VAR}=dotenv-key\n"
        f"{MODEL_VAR}=dotenv-model\n",
        encoding="utf-8",
    )

    settings = load_settings(env={}, dotenv_path=dotenv)

    assert settings.base_url == "https://dotenv.test/v1"
    assert settings.api_key == "dotenv-key"
    assert settings.model == "dotenv-model"


def test_read_dotenv_ignores_comments_and_quotes(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text(
        "# comment\n\n"
        f'{API_KEY_VAR}="{SECRET}"\n'
        "not a setting\n",
        encoding="utf-8",
    )

    assert read_dotenv(dotenv) == {API_KEY_VAR: SECRET}


def test_missing_key_names_the_variable_only(tmp_path: Path) -> None:
    env = _env()
    del env[API_KEY_VAR]

    with pytest.raises(SettingsError) as error:
        load_settings(env=env, dotenv_path=tmp_path / "absent.env")

    message = str(error.value)
    assert API_KEY_VAR in message
    assert SECRET not in message
    assert "https://provider.test/v1" not in message


def test_key_is_redacted_everywhere(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    settings = load_settings(env=_env(), dotenv_path=tmp_path / "absent.env")

    assert SECRET not in repr(settings)
    assert SECRET not in str(settings)
    assert SECRET not in repr(settings.to_record())
    assert settings.to_record()["api_key"] == "***"

    logger = logging.getLogger("paladin.settings.test")
    with caplog.at_level(logging.INFO, logger="paladin.settings.test"):
        logger.info("settings %s", settings)
    assert SECRET not in caplog.text


@pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")
@pytest.mark.parametrize("path", [".env", "runs/", "scratch/runs/"])
def test_git_ignores_secrets_and_run_artifacts(path: str) -> None:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "check-ignore", "-q", path],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"{path} is not ignored"


def test_env_example_lists_names_only() -> None:
    lines = (REPO_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    settings = [line for line in lines if "=" in line and not line.startswith("#")]
    names = {line.split("=", 1)[0].strip() for line in settings}
    assert names == {BASE_URL_VAR, API_KEY_VAR, MODEL_VAR}
    assert all(line.split("=", 1)[1].strip() == "" for line in settings)
