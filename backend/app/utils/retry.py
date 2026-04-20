from __future__ import annotations

import asyncio
import functools
import logging

import httpx

logger = logging.getLogger(__name__)


def with_retry(retries: int = 3, retry_on: set[int] | None = None):
    """Decorator: exponential backoff retry for async functions."""
    retry_on = retry_on or {429, 503}

    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            delay = 1.0
            for attempt in range(retries):
                try:
                    return await fn(*args, **kwargs)
                except httpx.HTTPStatusError as e:
                    if e.response.status_code in retry_on and attempt < retries - 1:
                        logger.warning(
                            "Retry %d/%d for %s (status=%d)",
                            attempt + 1, retries, fn.__name__, e.response.status_code,
                        )
                        await asyncio.sleep(delay)
                        delay *= 2
                    else:
                        raise
        return wrapper
    return decorator
