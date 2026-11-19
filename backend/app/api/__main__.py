"""uvicorn entry point: loopback only, one worker, hard startup refusal."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Sequence

from app.api.config import FreezeError, startup_check


def main(argv: Sequence[str] | None = None) -> int:
    """Refuse before serving when the freeze cannot select a model."""

    freeze_path = Path(argv[0]) if argv else None
    try:
        bundle = startup_check(freeze_path)
    except FreezeError as error:
        print(
            f"refused to start: {error}. See freeze.json selected_model.",
            file=sys.stderr,
        )
        return 2

    import uvicorn

    from app.api.main import create_app

    app = create_app(bundle=bundle, freeze_path=freeze_path)
    uvicorn.run(app, host="127.0.0.1", port=8000, workers=1, reload=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
