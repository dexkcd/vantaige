"""
Maps frontend setup (camelCase JSON) to google-genai LiveConnectConfig.
Uses SDK types so config matches the notebook (RealtimeInputConfig, AutomaticActivityDetection, etc.).
"""
from google.genai.types import (
    AutomaticActivityDetection,
    EndSensitivity,
    LiveConnectConfig,
    RealtimeInputConfig,
    StartSensitivity,
)


def setup_to_live_config(setup: dict) -> LiveConnectConfig:
    """
    Convert frontend setup message to LiveConnectConfig.
    Configures automatic activity detection (VAD) like the notebook so the model
    detects when the user stops speaking and replies without an explicit clientContent turnComplete.
    """
    gen = setup.get("generationConfig") or {}
    modalities = gen.get("responseModalities") or ["AUDIO"]
    response_modalities = [m.upper() if isinstance(m, str) else m for m in modalities]

    # RealtimeInputConfig with AutomaticActivityDetection (like the notebook)
    ric = setup.get("realtimeInputConfig") or {}
    aad = ric.get("automaticActivityDetection")
    start_sens = StartSensitivity.START_SENSITIVITY_LOW
    end_sens = EndSensitivity.END_SENSITIVITY_LOW
    if aad:
        ss = aad.get("startOfSpeechSensitivity")
        if ss and hasattr(StartSensitivity, ss):
            start_sens = getattr(StartSensitivity, ss)
        es = aad.get("endOfSpeechSensitivity")
        if es and hasattr(EndSensitivity, es):
            end_sens = getattr(EndSensitivity, es)
    automatic_activity_detection = AutomaticActivityDetection(
        disabled=aad.get("disabled", False) if aad else False,
        startOfSpeechSensitivity=start_sens,
        endOfSpeechSensitivity=end_sens,
        prefixPaddingMs=aad.get("prefixPaddingMs", 20) if aad else 20,
        silenceDurationMs=aad.get("silenceDurationMs", 100) if aad else 100,
    )
    realtime_input_config = RealtimeInputConfig(
        automaticActivityDetection=automatic_activity_detection,
        # Omit activityHandling/turnCoverage - can trigger 1008 on native-audio-preview
    )

    config_kw: dict = {
        "responseModalities": response_modalities,
        "realtimeInputConfig": realtime_input_config,
    }
    if gen.get("mediaResolution"):
        config_kw["mediaResolution"] = gen["mediaResolution"]
    # Skip contextWindowCompression for native-audio-preview (can trigger 1008 after a few turns)
    # if gen.get("contextWindowCompression"):
    #     config_kw["contextWindowCompression"] = gen["contextWindowCompression"]
    speech = gen.get("speechConfig")
    if speech:
        voice = (speech.get("voiceConfig") or {}).get("prebuiltVoiceConfig") or {}
        if voice.get("voiceName"):
            config_kw["speechConfig"] = {
                "voice_config": {"prebuilt_voice_config": {"voice_name": voice["voiceName"]}},
            }
    si = setup.get("systemInstruction")
    if si and si.get("parts"):
        config_kw["systemInstruction"] = {"parts": [{"text": p.get("text", "")} for p in si["parts"]]}
    tools_block = setup.get("tools")
    if tools_block and isinstance(tools_block, list):
        for t in tools_block:
            decls = t.get("functionDeclarations") or t.get("function_declarations")
            if decls:
                config_kw["tools"] = [{"function_declarations": _convert_function_declarations(decls)}]
                break
    elif tools_block and isinstance(tools_block, dict):
        decls = tools_block.get("functionDeclarations") or tools_block.get("function_declarations")
        if decls:
            config_kw["tools"] = [{"function_declarations": _convert_function_declarations(decls)}]

    return LiveConnectConfig(**config_kw)


def _convert_function_declarations(decls: list) -> list:
    """Convert camelCase function declarations to snake_case for SDK."""
    out = []
    for d in decls:
        fd = {
            "name": d.get("name"),
            "description": d.get("description", ""),
            "parameters": d.get("parameters") or {"type": "object", "properties": {}},
        }
        # Keep parameters as-is (nested type/properties/required)
        out.append(fd)
    return out
