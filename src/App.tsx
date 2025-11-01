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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Initialize Cerebras client
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
      console.error('Error calling Cerebras API:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
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
      {/* Header - VCB Cleaner Theme per §5.1-5.3 */}
      <header className="bg-vcb-black border-b border-vcb-mid-grey px-8 py-6">
        <div className="flex items-center justify-center space-x-6">
          {/* VCB Logo per §5.3 - must be on dark background */}
          <img
            src="https://i.postimg.cc/xdJqP9br/logo-transparent-Black-Back.png"
            alt="VCB Logo"
            className="h-32"
          />
          <div className="text-center">
            <h1 className="text-xl font-bold text-vcb-white tracking-wider">
              VCB-CHAT (BETA)
            </h1>
            <p className="text-vcb-white text-xs mt-0.5 font-medium uppercase tracking-wide">
              Powered by VCB-AI
            </p>
          </div>
        </div>
      </header>

      {/* Messages Container - 80%+ whitespace per §5.1 */}
      <div className="flex-1 overflow-y-auto px-8 py-12">
        <div className="max-w-5xl mx-auto space-y-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-vcb-mid-grey py-24">
              <svg
                className="w-20 h-20 mb-8 stroke-current"
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
              <p className="text-lg font-medium uppercase tracking-wide">
                Start a conversation with VCB-AI
              </p>
              <p className="text-sm mt-3 font-light">
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
                  className={`max-w-3xl border px-8 py-6 ${
                    message.role === 'user'
                      ? 'bg-vcb-white border-vcb-mid-grey'
                      : 'bg-white border-vcb-light-grey'
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {message.role === 'user' ? (
                        <div className="w-10 h-10 bg-vcb-black border border-vcb-mid-grey flex items-center justify-center">
                          <span className="text-sm font-medium text-vcb-white uppercase">U</span>
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-vcb-dark-grey border border-vcb-mid-grey flex items-center justify-center">
                          <span className="text-sm font-medium text-vcb-white uppercase">AI</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-vcb-mid-grey mb-2 uppercase tracking-wide">
                        {message.role === 'user' ? 'You' : 'VCB-AI'}
                      </p>
                      <p className="text-vcb-black whitespace-pre-wrap break-words leading-relaxed">
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
              <div className="max-w-3xl border border-vcb-light-grey bg-white px-8 py-6">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-vcb-dark-grey border border-vcb-mid-grey flex items-center justify-center">
                    <span className="text-sm font-medium text-vcb-white uppercase">AI</span>
                  </div>
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-vcb-mid-grey animate-bounce"></div>
                    <div className="w-2 h-2 bg-vcb-mid-grey animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-vcb-mid-grey animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Container - high contrast per §5.1 */}
      <div className="border-t border-vcb-light-grey bg-white px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
          <div className="flex space-x-4">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
              className="flex-1 bg-white text-vcb-black border border-vcb-light-grey px-6 py-4 focus:outline-none focus:border-vcb-mid-grey resize-none font-light leading-relaxed"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white px-8 py-4 font-medium uppercase tracking-wider transition-colors duration-200 flex items-center space-x-3 border border-vcb-mid-grey"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
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
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  <span>Send</span>
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
