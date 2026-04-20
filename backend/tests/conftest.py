from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="run tests marked as live",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    run_live = config.getoption("--run-live") or os.getenv("RUN_LIVE_TESTS") == "1"
    if run_live:
        return

    skip_live = pytest.mark.skip(
        reason="live tests are skipped by default; pass --run-live or set RUN_LIVE_TESTS=1",
    )
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip_live)
