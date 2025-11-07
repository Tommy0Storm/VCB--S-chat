from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import io
import wave
import numpy as np
import os
from gtts import gTTS

# Try to import MMS dependencies
try:
    from transformers import VitsModel, AutoTokenizer
    import torch
    import scipy
    MMS_AVAILABLE = True
    print("[OK] MMS (Transformers) available")
except ImportError as e:
    MMS_AVAILABLE = False
    print(f"[WARNING] MMS not available: {e}")

app = Flask(__name__)
CORS(app)

# SA Language to MMS/gTTS language code mapping
SA_LANGUAGE_CODES = {
    'en': 'eng',      # English -> MMS: eng, gTTS: en
    'af': 'afr',      # Afrikaans -> MMS: afr, gTTS: af
    'zu': 'zul',      # Zulu -> MMS: zul
    'xh': 'xho',      # Xhosa -> MMS: xho
    'nso': 'nso',     # Sepedi -> MMS: nso
    'tn': 'tsn',      # Setswana -> MMS: tsn
    'st': 'sot',      # Sesotho -> MMS: sot
    'ts': 'tso',      # Xitsonga -> MMS: tso
    'ss': 'ssw',      # siSwati -> MMS: ssw
    've': 'ven',      # Tshivenda -> MMS: ven
    'nr': 'nbl',      # isiNdebele -> MMS: nbl
}

# gTTS only supports these
GTTS_SUPPORTED = {'en', 'af'}

# Model cache
mms_models = {}

print("=" * 60)
if MMS_AVAILABLE:
    print("SA Languages TTS Server (Meta MMS + gTTS)")
    print("=" * 60)
    print(f"Supported SA languages: {', '.join(SA_LANGUAGE_CODES.keys())}")
    print("[OK] Using Meta MMS models for native SA languages")
    print("[OK] Using gTTS for English/Afrikaans")
else:
    print("SA Languages TTS Server (gTTS only)")
    print("=" * 60)
    print(f"Full support: en, af")
    print(f"[WARNING] Limited support for other SA languages")
    print("[INFO] Install transformers+torch for full MMS support")
print("=" * 60)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy', 
        'service': 'MMS Multilingual TTS Server (HF API)',
        'supported_languages': list(SA_LANGUAGE_CODES.keys())
    })

def generate_silent_audio():
    """Generate 1 second of silent audio as fallback"""
    sample_rate = 16000
    duration = 1
    num_samples = sample_rate * duration
    
    audio_buffer = io.BytesIO()
    with wave.open(audio_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        silent_audio = b'\x00\x00' * num_samples
        wav_file.writeframes(silent_audio)
    
    audio_buffer.seek(0)
    return audio_buffer.read()

def generate_tts_mms(text, lang_code='eng'):
    """Generate TTS using Meta's MMS models (local inference)"""
    if not MMS_AVAILABLE:
        return None
    
    try:
        print(f"[MMS] Generating speech with MMS for language: {lang_code}")
        
        # Check cache
        model_name = f"facebook/mms-tts-{lang_code}"
        if model_name not in mms_models:
            print(f"[LOAD] Loading model: {model_name} (first time, may take 30-60s)...")
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = VitsModel.from_pretrained(model_name)
            mms_models[model_name] = (tokenizer, model)
            print(f"[OK] Model cached")
        else:
            tokenizer, model = mms_models[model_name]
            print(f"[OK] Using cached model")
        
        # Generate speech
        inputs = tokenizer(text, return_tensors="pt")
        
        with torch.no_grad():
            output = model(**inputs).waveform
        
        # Convert to audio bytes (WAV format)
        audio_np = output.squeeze().cpu().numpy()
        
        # Create WAV file in memory
        audio_buffer = io.BytesIO()
        scipy.io.wavfile.write(audio_buffer, rate=model.config.sampling_rate, data=audio_np)
        audio_buffer.seek(0)
        audio_data = audio_buffer.read()
        
        print(f"[OK] Generated {len(audio_data)} bytes of {lang_code} speech")
        return audio_data
            
    except Exception as e:
        print(f"[ERROR] MMS error: {e}")
        import traceback
        traceback.print_exc()
        return None

def generate_tts_gtts(text, lang_code='en'):
    """Generate TTS using Google Text-to-Speech (gTTS)"""
    try:
        print(f"[MMS] Generating speech with gTTS for language: {lang_code}")
        
        # Create gTTS object
        tts = gTTS(text=text, lang=lang_code, slow=False)
        
        # Save to BytesIO buffer
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        audio_data = audio_buffer.read()
        
        print(f"[OK] Generated {len(audio_data)} bytes of {lang_code} speech")
        return audio_data
            
    except Exception as e:
        print(f"[ERROR] gTTS error: {e}")
        return None

@app.route('/tts-stream', methods=['POST'])
def text_to_speech_stream():
    try:
        data = request.json
        text = data.get('text', '')
        lang_code = data.get('lang_code', 'en')  # Get language code from request
        
        if not text:
            return jsonify({'error': 'Text is required'}), 400
        
        print(f"\n[TEXT] Text: {text[:50]}...")
        print(f"[LANG] Language: {lang_code}")
        
        # Get MMS language code
        mms_lang = SA_LANGUAGE_CODES.get(lang_code, 'eng')
        print(f"[LANG] MMS language code: {mms_lang}")
        
        audio_data = None
        mime_type = 'audio/wav'
        
        # Try MMS for non-English/Afrikaans languages
        if MMS_AVAILABLE and lang_code not in GTTS_SUPPORTED:
            print(f"[USE] Using MMS for {lang_code}")
            audio_data = generate_tts_mms(text, mms_lang)
            mime_type = 'audio/wav'
        
        # Fallback to gTTS for English/Afrikaans or if MMS failed
        if audio_data is None and lang_code in GTTS_SUPPORTED:
            print(f"[USE] Using gTTS for {lang_code}")
            gtts_code = 'en' if lang_code == 'en' else 'af'
            audio_data = generate_tts_gtts(text, gtts_code)
            mime_type = 'audio/mpeg'
        
        # Final fallback to silent audio
        if audio_data is None:
            print(f"[WARN] Falling back to silent audio")
            audio_data = generate_silent_audio()
            mime_type = 'audio/wav'
        
        print(f"[OK] Returning {len(audio_data)} bytes of audio ({mime_type})")
        return Response(
            audio_data,
            mimetype=mime_type,
            headers={
                'Content-Type': mime_type,
                'Content-Length': str(len(audio_data))
            }
        )
        
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"[SERVER] Server: http://localhost:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)
