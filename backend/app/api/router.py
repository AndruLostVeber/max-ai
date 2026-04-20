from fastapi import APIRouter

from app.api.v1 import auth_history, health, images, parse, proxy, research_v2, tools, voice

api_router = APIRouter()

# Auth + History + Memory
api_router.include_router(auth_history.router, prefix="/v1", tags=["auth"])

# OpenAI-compatible proxy
api_router.include_router(proxy.router, prefix="/v1", tags=["proxy"])

# Voice pipeline (ASR + TTS)
api_router.include_router(voice.router, prefix="/v1/voice", tags=["voice"])

# Vision + image generation
api_router.include_router(images.router, prefix="/v1", tags=["images"])

# Research V2
api_router.include_router(research_v2.router, prefix="/v1", tags=["research"])

# Health checks
api_router.include_router(health.router, prefix="/v1", tags=["health"])

# Document parser
api_router.include_router(parse.router, prefix="/v1", tags=["parse"])

# Utility tools
api_router.include_router(tools.router, prefix="/v1", tags=["tools"])
