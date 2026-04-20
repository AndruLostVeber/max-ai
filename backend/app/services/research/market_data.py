from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx

_CRYPTO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "DOGE": "dogecoin",
    "ETC": "ethereum-classic",
}


@dataclass(slots=True)
class MarketDataPoint:
    timestamp_ms: int
    price: float


class MarketDataService:
    async def get_history(
        self,
        entity: str,
        *,
        start_date: str,
        end_date: str,
    ) -> list[MarketDataPoint]:
        coin_id = _CRYPTO_IDS.get((entity or "").upper())
        if not coin_id:
            return []

        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        params = {
            "vs_currency": "usd",
            "from": int(start_dt.timestamp()),
            "to": int(end_dt.timestamp()),
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart/range",
                params=params,
            )
            response.raise_for_status()
            payload = response.json()

        points: list[MarketDataPoint] = []
        for item in payload.get("prices", []):
            if not isinstance(item, list) or len(item) < 2:
                continue
            try:
                timestamp_ms = int(item[0])
                price = float(item[1])
            except Exception:
                continue
            points.append(MarketDataPoint(timestamp_ms=timestamp_ms, price=price))
        return points
