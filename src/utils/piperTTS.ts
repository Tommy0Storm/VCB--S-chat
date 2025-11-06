// Piper TTS Integration for SA Languages
// High-quality neural TTS with multilingual support

export interface PiperVoice {
  name: string;
  language: string;
  code: string;
  quality: 'low' | 'medium' | 'high';
  speaker?: string;
}

// Available Piper voices for SA languages
export const PIPER_SA_VOICES: PiperVoice[] = [
  // English (South African)
  { name: 'en_ZA-google-low', language: 'English (SA)', code: 'en', quality: 'low' },
  { name: 'en_ZA-google-medium', language: 'English (SA)', code: 'en', quality: 'medium' },
  
  // Afrikaans
  { name: 'af_ZA-google-low', language: 'Afrikaans', code: 'af', quality: 'low' },
  { name: 'af_ZA-google-medium', language: 'Afrikaans', code: 'af', quality: 'medium' },
  
  // Fallback voices for other SA languages (using closest available)
  { name: 'en_ZA-google-medium', language: 'isiZulu', code: 'zu', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'isiXhosa', code: 'xh', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'Sepedi', code: 'nso', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'Setswana', code: 'tn', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'Sesotho', code: 'st', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'Xitsonga', code: 'ts', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'siSwati', code: 'ss', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'Tshivenda', code: 've', quality: 'medium' },
  { name: 'en_ZA-google-medium', language: 'isiNdebele', code: 'nr', quality: 'medium' },
];

export class PiperTTSClient {
  private apiUrl: string;
  private cache: Map<string, { audioBlob: Blob; timestamp: number }>;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(apiUrl: string = 'http://localhost:59125') {
    this.apiUrl = apiUrl;
    this.cache = new Map();
  }

  // Get voice for language code
  getVoiceForLanguage(languageCode: string, quality: 'low' | 'medium' | 'high' = 'medium'): PiperVoice {
    const voices = PIPER_SA_VOICES.filter(v => v.code === languageCode && v.quality === quality);
    if (voices.length > 0) {
      return voices[0];
    }
    
    // Fallback to English SA
    return PIPER_SA_VOICES.find(v => v.code === 'en' && v.quality === quality) || PIPER_SA_VOICES[0];
  }

  // Check if Piper server is available
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/voices`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Generate speech using Piper
  async synthesize(text: string, languageCode: string = 'en', quality: 'low' | 'medium' | 'high' = 'medium'): Promise<Blob> {
    const cacheKey = `${text}_${languageCode}_${quality}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      console.log('🚀 Piper TTS cache hit');
      return cached.audioBlob;
    }

    const voice = this.getVoiceForLanguage(languageCode, quality);
    
    try {
      const response = await fetch(`${this.apiUrl}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.substring(0, 500), // Limit text length
          voice: voice.name,
          output_format: 'wav',
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Piper TTS error: ${response.status} ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      
      // Cache the result
      this.cache.set(cacheKey, { audioBlob, timestamp: Date.now() });
      
      // Clean old cache entries
      this.cleanCache();
      
      console.log(`🎤 Piper TTS generated: ${voice.language} (${audioBlob.size} bytes)`);
      return audioBlob;
      
    } catch (error) {
      console.error('Piper TTS failed:', error);
      throw error;
    }
  }

  // Clean expired cache entries
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  // Get available voices
  async getAvailableVoices(): Promise<PiperVoice[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/voices`);
      if (response.ok) {
        const data = await response.json();
        return data.voices || PIPER_SA_VOICES;
      }
    } catch (error) {
      console.error('Failed to fetch Piper voices:', error);
    }
    
    return PIPER_SA_VOICES;
  }
}

// Browser fallback TTS for when Piper is unavailable
export class BrowserTTSFallback {
  private utterance: SpeechSynthesisUtterance | null = null;

  async synthesize(text: string, languageCode: string = 'en'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Browser TTS not supported'));
        return;
      }

      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      this.utterance = new SpeechSynthesisUtterance(text.substring(0, 300));
      
      // Set language based on SA language code
      const langMap: { [key: string]: string } = {
        'af': 'af-ZA',
        'en': 'en-ZA',
        'zu': 'zu-ZA',
        'xh': 'xh-ZA',
      };
      
      this.utterance.lang = langMap[languageCode] || 'en-ZA';
      this.utterance.rate = 1.2;
      this.utterance.pitch = 1.0;
      this.utterance.volume = 0.9;

      this.utterance.onend = () => resolve();
      this.utterance.onerror = (event) => reject(new Error(`Browser TTS error: ${event.error}`));

      window.speechSynthesis.speak(this.utterance);
      console.log(`🔊 Browser TTS fallback: ${languageCode}`);
    });
  }

  stop(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}