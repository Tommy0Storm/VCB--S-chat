from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import subprocess
import os

app = Flask(__name__)
CORS(app)

# SA Voices mapping
SA_VOICES = {
    'twi': {'model': 'kasanoma-twi-medium.onnx', 'name': 'Twi (Ghana)'},
    'chichewa': {'model': 'kasanoma-chichewa-medium.onnx', 'name': 'Chichewa'},
    'makhuwa': {'model': 'kasanoma-makhuwa-medium.onnx', 'name': 'Makhuwa'}
}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'Piper TTS Server'})

@app.route('/tts-stream', methods=['POST'])
def text_to_speech_stream():
    try:
        data = request.json
        text = data.get('text', '')
        voice = data.get('voice', 'twi')
        
        if not text:
            return jsonify({'error': 'Text is required'}), 400
        
        # For now, return a simple response since Piper models aren't installed
        # This allows your app to work while you set up the full Piper installation
        return jsonify({
            'message': f'TTS would generate: "{text}" with voice: {voice}',
            'voice_used': voice,
            'text_length': len(text)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Piper TTS Server on http://localhost:5000")
    print("Note: Install Piper models for full functionality")
    app.run(host='0.0.0.0', port=5000, debug=False)