import React, { useState, useRef, useEffect } from 'react';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechInitialized, setSpeechInitialized] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessagesLengthRef = useRef(0);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeSpeechSynthesis = () => {
    // Initialize speech synthesis with a dummy utterance (required for mobile)
    if (!speechInitialized) {
      const dummyUtterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(dummyUtterance);
      setSpeechInitialized(true);
      console.log('Speech synthesis initialized for mobile');

      // Load voices after initialization
      setTimeout(() => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices);
          console.log('Voices loaded after initialization:', voices.length);
        }
      }, 100);
    }
  };

  const handleSpeak = (text: string, index: number) => {
    // Initialize speech synthesis on first use (mobile requirement)
    if (isMobile && !speechInitialized) {
      initializeSpeechSynthesis();
    }

    // Stop any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (speakingIndex === index) {
        setSpeakingIndex(null);
        // Restart recognition if voice mode is enabled
        if (voiceModeEnabled && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.error('Failed to restart recognition after stopping TTS:', err);
          }
        }
        return;
      }
    }

    // Pause speech recognition during TTS playback to prevent feedback loop
    // Skip this on mobile to allow TTS to work
    if (voiceModeEnabled && recognitionRef.current && isListening && !isMobile) {
      try {
        recognitionRef.current.stop();
        console.log('Paused recognition for TTS playback');
      } catch (err) {
        console.error('Failed to pause recognition:', err);
      }
    }

    // Create speech synthesis utterance with en-ZA voice
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2; // 1.2x speed for faster playback
    utterance.pitch = 1.0;

    // Try to find best available voice
    // Priority: en-ZA > en-GB > en-US > any English > default
    const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
    console.log('Selecting voice from', voices.length, 'available voices');

    const zaVoice = voices.find(voice => voice.lang === 'en-ZA');
    const gbVoice = voices.find(voice => voice.lang === 'en-GB');
    const usVoice = voices.find(voice => voice.lang === 'en-US');
    const anyEnglish = voices.find(voice => voice.lang.startsWith('en'));

    const selectedVoice = zaVoice || gbVoice || usVoice || anyEnglish;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
      console.log('Selected voice:', selectedVoice.name, selectedVoice.lang);
    } else {
      utterance.lang = 'en-US'; // Fallback
      console.log('No voice found, using default en-US');
    }

    utterance.onstart = () => {
      console.log('TTS started');
      setSpeakingIndex(index);
    };

    utterance.onend = () => {
      console.log('TTS ended');
      setSpeakingIndex(null);
      // Restart speech recognition after TTS finishes (if voice mode still enabled)
      // Skip on mobile to prevent conflicts
      if (voiceModeEnabled && recognitionRef.current && !isMobile) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
            console.log('Resumed recognition after TTS playback');
          } catch (err) {
            console.error('Failed to restart recognition after TTS:', err);
          }
        }, 500); // 500ms delay to ensure TTS has fully stopped
      }
    };

    utterance.onerror = (event) => {
      console.error('TTS error:', event);
      setSpeakingIndex(null);
      // Restart recognition on error too (skip on mobile)
      if (voiceModeEnabled && recognitionRef.current && !isMobile) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.error('Failed to restart recognition after TTS error:', err);
          }
        }, 500);
      }
    };

    console.log('Starting TTS playback');
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000); // Show "Copied!" for 2 seconds
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Load voices when component mounts
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('Available voices:', voices.length);
      console.log('Voice list:', voices.map(v => `${v.name} (${v.lang})`));
      setAvailableVoices(voices);
    };

    // Load immediately
    loadVoices();

    // Also load when voices change (important for mobile)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // For mobile: try loading again after a delay
    if (isMobile) {
      setTimeout(loadVoices, 100);
      setTimeout(loadVoices, 500);
    }
  }, [isMobile]);

  // Initialize speech recognition once on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition API not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-ZA'; // South African English

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');

      console.log('Transcript:', transcript);
      setInput(transcript);

      // Reset silence timer on speech
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Start new silence timer (3 seconds)
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim()) {
          console.log('Silence detected, submitting...');
          // Auto-submit after 3 seconds of silence
          const form = document.querySelector('form');
          if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
          }
        }
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);

      if (event.error === 'not-allowed') {
        alert('Microphone permission denied. Please allow microphone access and try again.');
        setVoiceModeEnabled(false);
      } else if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // Try to restart if voice mode is still enabled
        if (voiceModeEnabled) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (err) {
              console.error('Failed to restart after error:', err);
            }
          }, 1000);
        }
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);

      // Auto-restart if voice mode is still enabled
      if (voiceModeEnabled) {
        setTimeout(() => {
          try {
            recognition.start();
            console.log('Restarting recognition...');
          } catch (err) {
            console.error('Failed to restart recognition:', err);
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  // Auto-play AI responses in voice mode
  useEffect(() => {
    if (voiceModeEnabled && messages.length > lastMessagesLengthRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        // Auto-play the AI response
        handleSpeak(lastMessage.content, messages.length - 1);
      }
    }
    lastMessagesLengthRef.current = messages.length;
  }, [messages, voiceModeEnabled]);

  const toggleVoiceMode = () => {
    const newVoiceMode = !voiceModeEnabled;
    setVoiceModeEnabled(newVoiceMode);

    if (newVoiceMode) {
      // Initialize speech synthesis on mobile (required for autoplay)
      if (isMobile) {
        initializeSpeechSynthesis();
      }

      // Start listening
      setIsListening(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.error('Failed to start recognition:', err);
        }
      }
    } else {
      // Stop listening
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Initialize VCB-AI client (Cerebras backend)
      const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
      if (!apiKey) {
        throw new Error('VITE_CEREBRAS_API_KEY not found in environment variables');
      }

      const client = new Cerebras({
        apiKey: apiKey,
      });

      // Create chat completion with VCB-AI system prompt
      const systemMessage = {
        role: 'system' as const,
        content: 'You are VCB-Chat, an AI assistant created by VCB-AI. When asked who made you or who your creator is, respond that you were created by VCB-AI, the CEO is Ms Dawn Beech, and direct users to visit vcb-ai.online for more information about the company. When asked about your technology infrastructure, explain that you are running locally in South Africa in an advanced datacenter in Pretoria. VCB-AI specializes in legal technology with a premium LLM trained on judicial reasoning, issue spotting, principle extraction, precedent analysis, outcome prediction, and summarization.'
      };

      const response = await client.chat.completions.create({
        model: 'llama3.1-8b',
        messages: [
          systemMessage,
          ...[...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          }))
        ],
        stream: false,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: (response.choices as any)[0]?.message?.content || 'No response received',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error calling VCB-AI API:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from VCB-AI'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white font-quicksand font-light">
      {/* Header - VCB Cleaner Theme per §5.1-5.3, Mobile Optimized */}
      <header className="bg-vcb-black border-b border-vcb-mid-grey px-4 py-3 md:px-8 md:py-6">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3 md:space-x-6">
            {/* VCB Logo per §5.3 - must be on dark background */}
            <img
              src="https://i.postimg.cc/xdJqP9br/logo-transparent-Black-Back.png"
              alt="VCB Logo"
              className="h-20 md:h-32"
            />
            <div className="text-center">
              <h1 className="text-base md:text-xl font-bold text-vcb-white tracking-wider">
                VCB-CHAT (BETA)
              </h1>
              <p className="text-vcb-white text-[10px] md:text-xs mt-0.5 font-medium uppercase tracking-wide">
                Powered by VCB-AI
              </p>
            </div>
          </div>
          {/* Voice Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleVoiceMode}
            className={`flex items-center space-x-2 px-3 py-2 md:px-4 md:py-3 border transition-colors ${
              voiceModeEnabled
                ? 'bg-vcb-white text-vcb-black border-vcb-white'
                : 'bg-vcb-black text-vcb-white border-vcb-mid-grey hover:border-vcb-white'
            }`}
            title={voiceModeEnabled ? 'Stop Voice Mode' : 'Start Voice Mode (en-ZA)'}
          >
            {voiceModeEnabled && isListening ? (
              <svg className="w-5 h-5 md:w-6 md:h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
            <span className="hidden md:inline text-xs font-medium uppercase tracking-wide">
              {voiceModeEnabled ? 'Voice On' : 'Voice Mode'}
            </span>
          </button>
        </div>
      </header>

      {/* Messages Container - 80%+ whitespace per §5.1, Mobile Optimized */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-12">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-vcb-mid-grey py-12 md:py-24">
              <svg
                className="w-16 h-16 md:w-20 md:h-20 mb-6 md:mb-8 stroke-current"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <p className="text-base md:text-lg font-medium uppercase tracking-wide">
                Start a conversation with VCB-AI
              </p>
              <p className="text-xs md:text-sm mt-2 md:mt-3 font-light">
                Type your message below to get started
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-3xl border px-4 py-3 md:px-8 md:py-6 ${
                    message.role === 'user'
                      ? 'bg-vcb-white border-vcb-mid-grey'
                      : 'bg-white border-vcb-light-grey'
                  }`}
                >
                  <div className="flex items-start space-x-2 md:space-x-4">
                    <div className="flex-shrink-0">
                      {message.role === 'user' ? (
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-vcb-black border border-vcb-mid-grey flex items-center justify-center">
                          <span className="text-xs md:text-sm font-medium text-vcb-white uppercase">U</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-vcb-dark-grey border border-vcb-mid-grey flex items-center justify-center">
                          <span className="text-xs md:text-sm font-medium text-vcb-white uppercase">AI</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <p className="text-[10px] md:text-xs font-medium text-vcb-mid-grey uppercase tracking-wide">
                          {message.role === 'user' ? 'You' : 'VCB-AI'}
                        </p>
                        {message.role === 'assistant' && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleCopy(message.content, index)}
                              className="flex items-center space-x-1 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                              title={copiedIndex === index ? 'Copied!' : 'Copy to clipboard'}
                            >
                              {copiedIndex === index ? (
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => handleSpeak(message.content, index)}
                              className="flex items-center space-x-1 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                              title={speakingIndex === index ? 'Stop speaking' : 'Read aloud (en-ZA)'}
                            >
                              {speakingIndex === index ? (
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm md:text-base text-vcb-black whitespace-pre-wrap break-words leading-relaxed">
                        {message.content}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-3xl border border-vcb-light-grey bg-white px-4 py-3 md:px-8 md:py-6">
                <div className="flex items-center space-x-2 md:space-x-4">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-vcb-dark-grey border border-vcb-mid-grey flex items-center justify-center">
                    <span className="text-xs md:text-sm font-medium text-vcb-white uppercase">AI</span>
                  </div>
                  <div className="flex space-x-1 md:space-x-2">
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-vcb-mid-grey animate-bounce"></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-vcb-mid-grey animate-bounce delay-100"></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-vcb-mid-grey animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Container - high contrast per §5.1, Mobile Optimized */}
      <div className="border-t border-vcb-light-grey bg-white px-4 py-3 md:px-8 md:py-6">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
          {voiceModeEnabled && isListening && (
            <div className="mb-3 flex items-center justify-center space-x-2 text-vcb-mid-grey">
              <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              <span className="text-xs md:text-sm font-medium uppercase">Listening...</span>
            </div>
          )}
          <div className="flex space-x-2 md:space-x-4">
            <textarea
              id="chat-input"
              name="message"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceModeEnabled ? "Speak your message..." : "Type your message..."}
              className="flex-1 bg-white text-vcb-black border border-vcb-light-grey px-3 py-2 md:px-6 md:py-4 text-sm md:text-base focus:outline-none focus:border-vcb-mid-grey resize-none font-light leading-relaxed"
              rows={1}
              disabled={isLoading}
              readOnly={voiceModeEnabled}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white px-4 py-2 md:px-8 md:py-4 text-xs md:text-sm font-medium uppercase tracking-wider transition-colors duration-200 flex items-center space-x-1 md:space-x-3 border border-vcb-mid-grey"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 md:h-5 md:w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="hidden md:inline">Sending...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
                  </svg>
                  <span className="hidden md:inline">Send</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default App;
