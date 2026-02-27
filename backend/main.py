"""
VantAIge Live API WebSocket bridge.
Connects the Next.js frontend to the Gemini Multimodal Live API via the google-genai SDK.
"""
import asyncio
import base64
import json
import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from config import setup_to_live_config

# Load .env from project root (parent of backend/) when present
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="VantAIge Live API Bridge")


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY must be set")
    return genai.Client(api_key=api_key)


def _part_to_client(part) -> dict:
    """Convert SDK part to frontend camelCase part (inlineData.data as base64)."""
    out = {}
    if getattr(part, "text", None):
        out["text"] = part.text
    if getattr(part, "inline_data", None) and part.inline_data.data:
        out["inlineData"] = {
            "mimeType": getattr(part.inline_data, "mime_type", None) or "audio/pcm",
            "data": base64.b64encode(part.inline_data.data).decode("utf-8"),
        }
    if getattr(part, "function_call", None):
        fc = part.function_call
        out["functionCall"] = {
            "name": getattr(fc, "name", None),
            "args": getattr(fc, "args", None) or {},
            "id": getattr(fc, "id", None),
        }
    return out


def _server_content_to_client(msg) -> dict | None:
    """Build frontend serverContent from SDK server_content message."""
    sc = getattr(msg, "server_content", None)
    if not sc:
        return None
    payload = {}
    if getattr(sc, "interrupted", None) is not None:
        payload["interrupted"] = sc.interrupted
    if getattr(sc, "turn_complete", None) is not None:
        payload["turnComplete"] = sc.turn_complete
    if getattr(sc, "model_turn", None) and getattr(sc.model_turn, "parts", None):
        payload["modelTurn"] = {
            "parts": [_part_to_client(p) for p in sc.model_turn.parts]
        }
    if getattr(sc, "input_transcription", None) and getattr(sc.input_transcription, "text", None):
        payload["inputTranscription"] = {"text": sc.input_transcription.text}
    if getattr(sc, "output_transcription", None) and getattr(sc.output_transcription, "text", None):
        payload["outputTranscription"] = {"text": sc.output_transcription.text}
    if not payload:
        return None
    return {"serverContent": payload}


def _tool_call_to_client(msg) -> dict | None:
    """Build frontend toolCall from SDK tool_call message."""
    tc = getattr(msg, "tool_call", None)
    if not tc or not getattr(tc, "function_calls", None):
        return None
    return {
        "toolCall": {
            "functionCalls": [
                {
                    "name": getattr(f, "name", None),
                    "args": getattr(f, "args", None) or {},
                    "id": getattr(f, "id", None),
                }
                for f in tc.function_calls
            ]
        }
    }


async def consumer(session, ws: WebSocket):
    """Read from session.receive() and send to client WebSocket. Loop so we get every turn."""
    turn_num = 0
    try:
        while True:
            turn_num += 1
            model_turn_parts_this_turn = 0
            logger.info("Consumer: receive loop iteration %s (waiting for next model reply)", turn_num)
            async for msg in session.receive():
                if getattr(msg, "setup_complete", None):
                    logger.info("Consumer: setup_complete -> client")
                    await ws.send_json({"setupComplete": True})
                out = _server_content_to_client(msg)
                if out:
                    sc = out.get("serverContent", {})
                    if sc.get("turnComplete"):
                        logger.info(
                            "Consumer: model reply complete -> client (%s audio chunks; if you hear nothing, check frontend playback)",
                            model_turn_parts_this_turn,
                        )
                    if sc.get("modelTurn", {}).get("parts"):
                        model_turn_parts_this_turn += 1
                        if model_turn_parts_this_turn <= 3 or model_turn_parts_this_turn % 100 == 0:
                            logger.info("Consumer: serverContent modelTurn (part #%s) -> client", model_turn_parts_this_turn)
                    await ws.send_json(out)
                out = _tool_call_to_client(msg)
                if out:
                    logger.info("Consumer: toolCall -> client")
                    await ws.send_json(out)
                if getattr(msg, "error", None):
                    logger.warning("Consumer: error from Gemini: %s", msg.error)
                    await ws.send_json({"error": {"message": str(msg.error)}})
            logger.info("Consumer: receive() iterator ended, looping for next exchange")
    except Exception as e:
        logger.exception("Consumer error: %s", e)
        try:
            await ws.send_json({"error": {"code": 500, "message": str(e)}})
        except Exception:
            pass


async def producer(session, ws: WebSocket):
    """Read from client WebSocket and dispatch to session."""
    audio_chunk_count = 0
    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            if "realtimeInput" in data:
                ri = data["realtimeInput"] or {}
                # Audio / image chunks from the frontend
                chunks = ri.get("mediaChunks") or []
                for c in chunks:
                    audio_chunk_count += 1
                    if audio_chunk_count <= 3 or audio_chunk_count % 500 == 0:
                        logger.info("Producer: realtimeInput chunk #%s", audio_chunk_count)
                    b64 = c.get("data", "")
                    mime = (c.get("mimeType") or "audio/pcm;rate=16000").lower()
                    blob_data = base64.b64decode(b64) if isinstance(b64, str) else b64
                    blob = types.Blob(data=blob_data, mimeType=mime)
                    # Match official sample: audio → audio=Blob(...), images → video=Blob(...)
                    if mime.startswith("audio/") or "pcm" in mime:
                        await session.send_realtime_input(audio=blob)
                    elif mime.startswith("image/") or "jpeg" in mime or "png" in mime:
                        await session.send_realtime_input(video=blob)
                # Optional text realtime input from the frontend
                text = ri.get("text")
                if isinstance(text, str) and text.strip():
                    logger.info("Producer: realtimeInput text -> Gemini")
                    await session.send_realtime_input(text=text)
            elif "toolResponse" in data:
                tr = data["toolResponse"]
                responses = tr.get("functionResponses") or []
                for fr in responses:
                    await session.send_tool_response(
                        function_responses=[
                            types.FunctionResponse(
                                name=fr.get("name"),
                                response=fr.get("response") or {},
                                id=fr.get("id"),
                            )
                        ]
                    )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Producer error: %s", e)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        raw = await ws.receive_text()
        data = json.loads(raw)
        setup = data.get("setup")
        if not setup:
            await ws.send_json({"error": {"code": 400, "message": "First message must contain setup"}})
            await ws.close()
            return
        model = setup.get("model", "models/gemini-2.5-flash-native-audio-preview-12-2025")
        config = setup_to_live_config(setup)
        client = get_client()

        async with client.aio.live.connect(model=model, config=config) as session:
            await ws.send_json({"setupComplete": True})
            consumer_task = asyncio.create_task(consumer(session, ws))
            producer_task = asyncio.create_task(producer(session, ws))
            done, _ = await asyncio.wait(
                [consumer_task, producer_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in done:
                t.cancel()
            await asyncio.gather(consumer_task, producer_task, return_exceptions=True)
    except ValueError as e:
        logger.error("Config error: %s", e)
        try:
            await ws.send_json({"error": {"code": 500, "message": str(e)}})
        except Exception:
            pass
    except Exception as e:
        logger.exception("WebSocket session error: %s", e)
        try:
            await ws.send_json({"error": {"code": 500, "message": str(e)}})
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
