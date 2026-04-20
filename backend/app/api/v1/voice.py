from __future__ import annotations

"""
Voice pipeline.

POST /voice/message
  audio → ASR → Router → LLM → TTS → return MP3 + transcript headers

WS /ws/voice
  binary audio chunks → transcript (JSON) → token stream (JSON) → final audio (binary)
"""
from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from app.models.mws import ChatCompletionRequest, Message
from app.services.asr_client import ASRClient, get_asr_client
from app.services.mws_client import MWSClient, get_mws_client
from app.services.router_client import RouterClient, get_router_client
from app.services.tts_service import TTSService, get_tts_service

router = APIRouter()

SUPPORTED_AUDIO = {
    "audio/wav", "audio/mpeg", "audio/ogg", "audio/mp4",
    "audio/flac", "audio/x-flac", "audio/x-m4a",
}


@router.post("/message")
async def voice_message(
    audio: UploadFile = File(...),
    user_id: str = Form(default="anonymous"),
    asr: ASRClient = Depends(get_asr_client),
    tts: TTSService = Depends(get_tts_service),
    mws: MWSClient = Depends(get_mws_client),
    router_client: RouterClient = Depends(get_router_client),
):
    audio_bytes = await audio.read()

    # 1. ASR
    try:
        transcript = await asr.transcribe(audio_bytes, filename=audio.filename or "audio.wav")
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"error": "ASR недоступен", "detail": str(e)})

    # 2. Route (ignore ASR task_type — transcript is now just text)
    route = await router_client.route(message=transcript, attachments=[])

    # 3. LLM (limit output for voice — short spoken answers)
    req = ChatCompletionRequest(
        model=route.model_id,
        messages=[
            Message(role="system", content="Отвечай кратко, не более 3-4 предложений. Ответ будет зачитан вслух."),
            Message(role="user", content=transcript),
        ],
        max_tokens=300,
    )
    llm_resp = await mws.chat(req)
    answer = llm_resp["choices"][0]["message"]["content"]

    # 4. TTS (Silero → edge-tts → JSON fallback)
    try:
        import urllib.parse
        audio_out, mime = await tts.synthesize(answer[:800])
        return Response(
            content=audio_out,
            media_type=mime,
            headers={
                "X-Transcript": urllib.parse.quote(transcript[:500]),
                "X-Answer": urllib.parse.quote(answer[:500]),
            },
        )
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={
            "transcript": transcript,
            "answer": answer,
            "tts_available": False,
        })


@router.websocket("/ws/voice")
async def ws_voice(
    websocket: WebSocket,
    asr: ASRClient = Depends(get_asr_client),
    tts: TTSService = Depends(get_tts_service),
    mws: MWSClient = Depends(get_mws_client),
    router_client: RouterClient = Depends(get_router_client),
):
    """
    Protocol:
      Client  →  server : binary audio blob
      Server  →  client : {"type": "transcript", "text": "..."}
      Server  →  client : {"type": "token", "text": "..."}   (repeated)
      Server  →  client : binary MP3 audio
    """
    await websocket.accept()
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()

            # ASR
            transcript = await asr.transcribe(audio_bytes, filename="stream.wav")
            await websocket.send_json({"type": "transcript", "text": transcript})

            # Route
            route = await router_client.route(message=transcript, attachments=[])

            # LLM streaming tokens
            req = ChatCompletionRequest(
                model=route.model_id,
                messages=[Message(role="user", content=transcript)],
                stream=True,
            )
            full_text = ""
            async for token in mws.stream_tokens(req):
                await websocket.send_json({"type": "token", "text": token})
                full_text += token

            # TTS → send binary (fallback to done event if unavailable)
            if full_text:
                try:
                    audio_out, _ = await tts.synthesize(full_text)
                    await websocket.send_bytes(audio_out)
                except Exception:
                    await websocket.send_json({"type": "done", "text": full_text, "tts_available": False})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except Exception:
            pass
