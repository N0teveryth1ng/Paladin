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
    load_model_settings,
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


# -- per-model credentials -------------------------------------------------


def test_model_entry_can_name_its_own_variables(tmp_path: Path) -> None:
    env = {
        "ZHIPU_BASE_URL": "https://zhipu.test/v1",
        "ZHIPU_API_KEY": SECRET,
        "LLM_MODEL": "shared-model",
    }
    entry = {
        "model_id": "glm-4.6",
        "base_url_env": "ZHIPU_BASE_URL",
        "api_key_env": "ZHIPU_API_KEY",
    }

    settings = load_model_settings(entry, env=env, dotenv_path=tmp_path / "absent.env")

    assert settings.base_url == "https://zhipu.test/v1"
    assert settings.api_key == SECRET
    assert settings.model == "glm-4.6"


def test_model_entry_defaults_to_the_shared_variables(tmp_path: Path) -> None:
    entry = {"model_id": "picked-model"}

    settings = load_model_settings(
        entry, env=_env(), dotenv_path=tmp_path / "absent.env"
    )

    assert settings.base_url == "https://provider.test/v1"
    assert settings.api_key == SECRET
    assert settings.model == "picked-model"


def test_model_entry_without_model_id_uses_the_shared_model(tmp_path: Path) -> None:
    settings = load_model_settings(
        {}, env=_env(), dotenv_path=tmp_path / "absent.env"
    )

    assert settings.model == "test-model"


def test_per_model_variables_fall_back_to_dotenv(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text(
        "OTHER_BASE_URL=https://other.test/v1\n"
        f"OTHER_API_KEY={SECRET}\n",
        encoding="utf-8",
    )
    entry = {
        "base_url_env": "OTHER_BASE_URL",
        "api_key_env": "OTHER_API_KEY",
        "model_id": "other-model",
    }

    settings = load_model_settings(entry, env={}, dotenv_path=dotenv)

    assert settings.base_url == "https://other.test/v1"
    assert settings.api_key == SECRET
    assert settings.model == "other-model"


def test_per_model_key_is_redacted_everywhere(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    env = {
        "ZHIPU_BASE_URL": "https://zhipu.test/v1",
        "ZHIPU_API_KEY": SECRET,
    }
    entry = {
        "base_url_env": "ZHIPU_BASE_URL",
        "api_key_env": "ZHIPU_API_KEY",
        "model_id": "glm-4.6",
    }

    settings = load_model_settings(entry, env=env, dotenv_path=tmp_path / "absent.env")

    assert SECRET not in repr(settings)
    assert SECRET not in str(settings)
    assert SECRET not in repr(settings.to_record())
    assert settings.to_record() == {
        "base_url": "https://zhipu.test/v1",
        "api_key": "***",
        "model": "glm-4.6",
    }

    logger = logging.getLogger("paladin.settings.per_model")
    with caplog.at_level(logging.INFO, logger="paladin.settings.per_model"):
        logger.info("settings %s", settings)
    assert SECRET not in caplog.text


def test_missing_per_model_variable_names_the_entry_variable(tmp_path: Path) -> None:
    entry = {
        "base_url_env": "ZHIPU_BASE_URL",
        "api_key_env": "ZHIPU_API_KEY",
        "model_id": "glm-4.6",
    }

    with pytest.raises(SettingsError) as error:
        load_model_settings(
            entry, env={}, dotenv_path=tmp_path / "absent.env"
        )

    message = str(error.value)
    assert "ZHIPU_BASE_URL" in message
    assert SECRET not in message


@pytest.mark.parametrize("bad_name", ["lowercase", "with-dash", "1LEADING", ""])
def test_invalid_env_name_is_rejected_without_a_value(
    tmp_path: Path, bad_name: str
) -> None:
    entry = {"api_key_env": bad_name}

    with pytest.raises(SettingsError) as error:
        load_model_settings(entry, env=_env(), dotenv_path=tmp_path / "absent.env")

    message = str(error.value)
    assert "api_key_env" in message
    assert SECRET not in message
