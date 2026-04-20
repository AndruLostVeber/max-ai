from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl

from app.api.v1.auth_history import AuthenticatedUser, get_current_user
from app.services.web_parser import WebParserService
from app.services.web_search import WebSearchService

router = APIRouter()


class WebSearchRequest(BaseModel):
    query: str
    max_results: int = 5


class WebParseRequest(BaseModel):
    url: HttpUrl
    extract_links: bool = False


@router.post("/tools/web-search")
async def web_search(
    body: WebSearchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    del current_user
    results = await WebSearchService().search(body.query, max_results=body.max_results)
    return {"query": body.query, "results": results}


@router.post("/tools/web-parse")
async def web_parse(
    body: WebParseRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    del current_user
    return await WebParserService().parse(str(body.url), extract_links=body.extract_links)
