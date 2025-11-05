import React, { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { UsageTracker, TierType } from './utils/usageTracker';
import { ConversationManager, Message } from './utils/conversationManager';

// Post-process AI response to enforce VCB formatting rules
const enforceFormatting = (text: string): string => {
  let fixed = text;

  // STEP 1: Strip ALL emojis (zero tolerance) - comprehensive Unicode ranges
  // Covers: emoticons, symbols, pictographs, flags, dingbats, misc symbols, etc.
  fixed = fixed.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{3000}-\u{303F}\u{FE00}-\u{FE0F}\u{200D}\u{20D0}-\u{20FF}]/gu, '');

  // STEP 1.5: Additional pass for common emoji patterns that might have been missed
  // Target specific problematic emojis seen in production
  fixed = fixed.replace(/[⚙️💡🕰️⚠️🏛️⚖️🌍🌈🏆🧠🎭🤝🕊️✅🌱]/gu, '');

  // STEP 2: Remove invalid icon names (non-existent Material Icons)
  const invalidIcons = ['crushed', 'smile', 'oomph']; // Add more as discovered
  invalidIcons.forEach(invalid => {
    const regex = new RegExp(`\\[${invalid}\\]`, 'gi');
    fixed = fixed.replace(regex, '');
  });

  // STEP 3: Fix icons without square brackets (common mistake)
  const iconNames = [
    'check_circle', 'warning', 'info', 'error', 'cancel', 'verified',
    'arrow_forward', 'arrow_back', 'arrow_upward', 'arrow_downward',
    'lightbulb', 'schedule', 'timer', 'today', 'settings', 'build',
    'home', 'search', 'menu', 'close', 'edit', 'delete', 'save',
    'image', 'photo', 'video_library', 'music_note', 'cake', 'receipt',
    'restaurant', 'local_fire_department'
  ];

  // Wrap standalone icon names in brackets
  iconNames.forEach(iconName => {
    const regex = new RegExp(`\\b${iconName}\\b(?!\\])`, 'g');
    fixed = fixed.replace(regex, (match, offset) => {
      // Don't wrap if already in brackets or part of URL
      if (offset > 0 && fixed[offset - 1] === '[') return match;
      if (fixed.substring(offset - 5, offset) === 'http') return match;
      return `[${match}]`;
    });
  });

  const lines = fixed.split('\n');
  const result: string[] = [];
  let listCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      result.push(line);
      listCounter = 1; // Reset counter after blank line
      continue;
    }

    // 1. Convert bullets to numbered lists
    const bulletMatch = trimmed.match(/^[\-\*•]\s+(.+)$/);
    if (bulletMatch) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}${listCounter}. ${bulletMatch[1]}`);
      listCounter++;
      continue;
    }

    // 2. Detect standalone headings and add ## markdown syntax
    // Heading criteria:
    // - Not already a heading (doesn't start with #)
    // - Short line (< 60 chars)
    // - Starts with capital letter OR ends with colon
    // - Not a numbered list
    // - Preceded by blank line or is first line
    const prevLine = i > 0 ? lines[i - 1].trim() : '';
    const isHeading = !trimmed.startsWith('#') &&
                      !trimmed.match(/^\d+\./) &&
                      trimmed.length < 60 &&
                      (trimmed[0] === trimmed[0].toUpperCase() || trimmed.endsWith(':')) &&
                      !trimmed.match(/[.!?]$/) &&
                      (i === 0 || prevLine === '' || prevLine.startsWith('#'));

    if (isHeading) {
      // Remove trailing colon if present
      const headingText = trimmed.replace(/:$/, '');
      result.push(`## ${headingText}`);
      listCounter = 1;
      continue;
    }

    // 3. Keep line as-is
    result.push(line);
  }

  return result.join('\n');
};

// Universal Icon Mapping System - Domain-Aware Canonical Icons
// Based on universal_icon_mapping_all_domains.csv (12 domains, 150+ mappings)
const normalizeIcons = (text: string): string => {
  // Comprehensive mapping: alternative → canonical (primary icon from CSV)
  const universalIconMap: { [key: string]: string } = {
    // COOKING & FOOD domain
    'fireplace': 'local_fire_department', 'whatshot': 'local_fire_department', 'fire': 'local_fire_department', 'oven': 'local_fire_department',
    'snowflake': 'ac_unit',
    'auto_mixer': 'blender', 'kitchen': 'blender',
    'content_cut': 'kitchen_knife', 'scissors': 'kitchen_knife',
    'ruler': 'straighten',
    'shopping_cart': 'inventory_2',
    'cookie': 'baking_production', 'pie': 'baking_production',
    'local_dining': 'restaurant', 'room_service': 'restaurant', 'dining': 'restaurant', 'fastfood': 'restaurant',
    'timer': 'schedule', 'access_time': 'schedule',
    'set_meal': 'bowl', 'lunch_dining': 'bowl', 'container': 'bowl',
    'call_merge': 'merge_type', 'unarchive': 'merge_type',

    // TECHNOLOGY & CODING domain
    'error_outline': 'error', 'cancel': 'error',
    'done': 'check_circle', 'verified': 'check_circle', 'task_alt': 'check_circle',
    'priority_high': 'warning', 'report_problem': 'warning',
    'autorenew': 'loop', 'hourglass_empty': 'loop',
    'build': 'bug_report', 'code': 'bug_report',
    'backup': 'save', 'cloud_download': 'save',
    'send': 'publish', 'rocket_launch': 'publish',
    'handyman': 'build', 'construction': 'build',
    'done_all': 'check_circle',
    'database': 'storage', 'cloud_queue': 'storage',
    'api': 'cloud', 'router': 'cloud',
    'security': 'lock', 'verified_user': 'lock',
    'delete_forever': 'delete', 'remove': 'delete',

    // HEALTH & MEDICAL domain
    'healing': 'favorite', 'heart_plus': 'favorite',
    'medication': 'pills', 'vaccine': 'pills',
    'sentiment_very_dissatisfied': 'sick',
    'directions_run': 'fitness_center', 'sports': 'fitness_center',
    'medical_information': 'person_health', 'emergency': 'person_health',
    'medical_services': 'local_hospital', 'domain': 'local_hospital',
    'apple': 'restaurant',
    'hotel': 'bedtime', 'bedroom_baby': 'bedtime',
    'monitor_weight': 'scale',
    'directions_bike': 'directions_walk',

    // BUSINESS & FINANCE domain
    'currency_exchange': 'attach_money', 'payment': 'attach_money',
    'arrow_upward': 'trending_up', 'show_chart': 'trending_up', 'bar_chart': 'trending_up',
    'arrow_downward': 'trending_down',
    'auto_invest': 'trending_up', 'savings': 'trending_up',
    'credit_card': 'payment', 'wallet': 'payment',
    'article': 'description', 'contract': 'description',
    'calendar_today': 'event', 'groups': 'event',
    'edit_note': 'slideshow',
    'assessment': 'description', 'auto_stories': 'description',
    'people': 'groups', 'supervisor_account': 'groups',
    'gps_fixed': 'bullseye', 'track_changes': 'bullseye',

    // LEARNING & EDUCATION domain
    'book': 'school',
    'task': 'assignment', 'assignment_turned_in': 'assignment',
    'help_outline': 'help', 'question_mark': 'help',
    'comment': 'forum', 'chat': 'forum',
    'play_circle': 'videocam', 'movie': 'videocam',
    'file_copy': 'description', 'insert_drive_file': 'description',
    'speed': 'trending_up',
    'military_tech': 'verified', 'card_giftcard': 'verified',

    // TRAVEL & TRANSPORTATION domain
    'flight_takeoff': 'flight', 'flight_land': 'flight',
    'bed': 'hotel',
    'two_wheeler': 'directions_car', 'train': 'directions_car',
    'map': 'location_on', 'pin_drop': 'location_on',
    'place': 'gps_fixed',
    'directions': 'navigation',
    'event_available': 'calendar_today',
    'sell': 'confirmation_number',
    'backpack': 'luggage', 'shopping_bag': 'luggage',
    'document_scanner': 'card_travel',

    // SOCIAL & COMMUNICATION domain
    'message': 'mail', 'mail_outline': 'mail',
    'smartphone': 'phone', 'call': 'phone',
    'video_call': 'videocam',
    'share_location': 'share', 'file_download': 'share',
    'thumb_up': 'favorite', 'star': 'favorite',
    'following': 'person_add', 'person_plus_one': 'person_add',
    'person_add': 'people',
    'notifications_active': 'notifications',
    'no_accounts': 'block',
    'report': 'flag',

    // MEDIA & CREATIVE domain
    'photo': 'image', 'image_aspect_ratio': 'image',
    'video_library': 'videocam',
    'headphones': 'music_note', 'volume_up': 'music_note',
    'create': 'edit',
    'color_lens': 'palette', 'brush': 'palette',
    'adjust': 'tune', 'graphic_eq': 'tune',
    'crop_square': 'crop',
    'cloud_upload': 'upload', 'publish': 'upload',
    'get_app': 'download',

    // WEATHER & NATURE domain
    'light_mode': 'wb_sunny', 'sunny': 'wb_sunny',
    'grain': 'cloud_queue', 'opacity': 'cloud_queue',
    'flash_on': 'cloud_queue',
    'cloud_circle': 'cloud',
    'device_thermostat': 'thermostat',
    'water': 'opacity',
    'expand': 'compress',

    // SPORTS & FITNESS domain
    'sports_bar': 'fitness_center',

    // HOME & LIVING domain
    'couch': 'chair',
    'microwave': 'kitchen',
    'bedroom_parent': 'bed',
    'shower': 'bathtub', 'wc': 'bathtub',
    'vacuum': 'cleaning_services', 'soap': 'cleaning_services',
    'lightbulb': 'light_mode',
    'brush_icon': 'palette',

    // SHOPPING & ECOMMERCE domain
    'local_offer': 'shopping_cart',
    'inventory_2': 'shopping_bag',
    'attach_money': 'payment',
    'directions_car': 'local_shipping',
    'undo': 'assignment_return', 'restore': 'assignment_return',
    'discount': 'local_offer',
    'rate_review': 'star', 'feedback': 'star',
    'favorite_border': 'favorite',
    'tabs': 'category', 'view_list': 'category',
    'magnifying_glass': 'search', 'find_in_page': 'search',

    // ENVIRONMENT & SUSTAINABILITY domain
    'eco': 'recycle', 'spa': 'recycle',
    'bolt': 'bolt',
    'water_drop': 'water',
    'nature': 'nature',

    // GENERAL ACTIONS domain
    'add_circle': 'add', 'add_box': 'add',
    'information': 'info',
    'open_in_browser': 'open_in_new', 'launch': 'open_in_new',
    'expand_less': 'expand_more', 'unfold_more': 'expand_more',
    'unfold_less': 'expand_less', 'keyboard_arrow_up': 'expand_less',

    // Common misspellings and concept mappings
    'mixingbowl': 'blender',
    'spatula': 'kitchen_knife',
    'eggs': 'egg',
  };

  // Replace icon references with canonical versions
  return text.replace(/\[([a-z_0-9]+)\]/gi, (match, iconName) => {
    const normalized = universalIconMap[iconName.toLowerCase()];
    return normalized ? `[${normalized}]` : match;
  });
};

// Fix markdown tables that are missing header rows (GFM requirement)
const fixMarkdownTables = (text: string): string => {
  let fixed = text;
  
  // STEP 1: Remove standalone "---" horizontal rules (AI keeps adding them despite instructions)
  fixed = fixed.replace(/^\s*---+\s*$/gm, '');
  
  // STEP 2: Fix markdown tables by ensuring proper spacing and structure
  const lines = fixed.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      result.push('');
      continue;
    }

    // Detect table header row (starts and ends with |)
    const isTableRow = /^\|.*\|$/.test(line);
    
    if (isTableRow) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const isSeparatorLine = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)+\|$/.test(nextLine);
      
      // If this is a header row followed by separator, ensure blank line before table
      if (isSeparatorLine && result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push(''); // Add blank line before table
      }
      
      result.push(line);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
};

// Memoized Message Component - prevents unnecessary re-renders
interface MessageComponentProps {
  message: Message;
  index: number;
  onCopy: (text: string, index: number) => void;
  onSpeak: (text: string, index: number) => void;
  copiedIndex: number | null;
  speakingIndex: number | null;
  markdownComponents: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const MessageComponent = React.memo(({
  message,
  index,
  onCopy,
  onSpeak,
  copiedIndex,
  speakingIndex,
  markdownComponents,
}: MessageComponentProps) => {
  return (
    <div
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
              <img
                src="sovereign-chat-icon-static.svg"
                alt="VCB-AI"
                className="w-8 h-8 md:w-10 md:h-10"
              />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1 md:mb-2">
              <p className="text-[10px] md:text-xs font-medium text-vcb-mid-grey uppercase tracking-wide">
                {message.role === 'user' ? '' : 'VCB-AI'}
              </p>
              {message.role === 'assistant' && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onCopy(message.content, index)}
                    className="flex items-center space-x-1 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                    title={copiedIndex === index ? 'Copied!' : 'Copy to clipboard'}
                  >
                    {copiedIndex === index ? (
                      <span className="material-icons text-base md:text-xl">check</span>
                    ) : (
                      <span className="material-icons text-base md:text-xl">content_copy</span>
                    )}
                  </button>
                  <button
                    onClick={() => onSpeak(message.content, index)}
                    className="hidden flex items-center space-x-1 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                    title={speakingIndex === index ? 'Stop speaking' : 'Read aloud (en-ZA)'}
                  >
                    {speakingIndex === index ? (
                      <span className="material-icons text-base md:text-xl">pause</span>
                    ) : (
                      <span className="material-icons text-base md:text-xl">volume_up</span>
                    )}
                  </button>
                </div>
              )}
            </div>
            {message.type === 'image' && message.imageUrl ? (
              <div className="space-y-3">
                <div className="text-sm md:text-base text-vcb-black break-words leading-relaxed">
                  {message.content}
                </div>
                <div className="border border-vcb-light-grey p-2 bg-vcb-white">
                  <img
                    src={message.imageUrl}
                    alt={message.imagePrompt || 'Generated image'}
                    className="w-full h-auto rounded"
                    loading="lazy"
                  />
                </div>
                {message.imagePrompt && (
                  <div className="text-xs text-vcb-mid-grey italic">
                    Prompt: {message.imagePrompt}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm md:text-base text-vcb-black break-words leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={markdownComponents}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

MessageComponent.displayName = 'MessageComponent';

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
  const [showUsage, setShowUsage] = useState(false);
  const [userTier, setUserTier] = useState<TierType>('free');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionTime, setSessionTime] = useState(0); // Session time in seconds
  const sessionStartRef = useRef<number>(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessagesLengthRef = useRef(0);
  const usageTrackerRef = useRef<UsageTracker>(new UsageTracker());
  const conversationManagerRef = useRef<ConversationManager>(new ConversationManager());
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Detect if user wants image generation (temporarily disabled)
  const isImageGenerationRequest = (_text: string): boolean => {
    // Image generation temporarily disabled until Cerebras API supports it
    return false;

    // const lowerText = text.toLowerCase();
    // const imageKeywords = [
    //   'make an image',
    //   'make a image',
    //   'create an image',
    //   'create a image',
    //   'generate an image',
    //   'generate a image',
    //   'draw an image',
    //   'draw a image',
    //   'make me an image',
    //   'make me a picture',
    //   'create a picture',
    //   'generate a picture',
    //   'draw a picture',
    //   'paint an image',
    //   'paint a picture',
    //   'show me an image',
    //   'design an image',
    //   'design a picture'
    // ];
    // return imageKeywords.some(keyword => lowerText.includes(keyword));
  };

  // Extract image prompt from user request
  const extractImagePrompt = (text: string): string => {
    // Try to find the prompt after keywords like "of", "showing", "with", etc.
    const patterns = [
      /(?:make|create|generate|draw|paint|design|show me)\s+(?:an?|me\s+an?)\s+(?:image|picture)\s+(?:of|showing|with|that shows?)\s+(.+)/i,
      /(?:make|create|generate|draw|paint|design|show me)\s+(?:an?|me\s+an?)\s+(?:image|picture)\s+(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Fallback: use the entire text as prompt
    return text.trim();
  };

  const scrollToBottom = useCallback(() => {
    // Use requestAnimationFrame to prevent forced reflow during critical rendering
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, []);

  // Memoized icon processing helper - prevents recreation on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processIcons = useCallback((children: any): any => {
    if (typeof children === 'string') {
      const parts = children.split(/(\[[a-z_0-9]+\])/g);
      return parts.map((part, idx) => {
        const iconMatch = part.match(/^\[([a-z_0-9]+)\]$/);
        if (iconMatch) {
          return <span key={idx} className="material-icons" style={{ fontSize: '1.8em', verticalAlign: 'middle', color: 'inherit' }}>{iconMatch[1]}</span>;
        }
        return part;
      });
    }
    if (Array.isArray(children)) {
      return children.map((child) => typeof child === 'string' ? processIcons(child) : child);
    }
    return children;
  }, []);

  // Memoized ReactMarkdown components - prevents recreation on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markdownComponents = React.useMemo(() => ({
    // Helper to process icons in any text content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p: ({children, ...props}: any) => <p {...props}>{processIcons(children)}</p>,
    // UPPERCASE headings with icon support
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h1: ({children, ...props}: any) => <h1 {...props} className="text-2xl font-bold uppercase my-4">{processIcons(children)}</h1>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h2: ({children, ...props}: any) => <h2 {...props} className="text-xl font-bold uppercase my-3">{processIcons(children)}</h2>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h3: ({children, ...props}: any) => <h3 {...props} className="text-lg font-bold uppercase my-2">{processIcons(children)}</h3>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h4: ({children, ...props}: any) => <h4 {...props} className="text-base font-bold uppercase my-2">{processIcons(children)}</h4>,
    // Premium table styling
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: ({...props}: any) => (
      <div className="overflow-x-auto my-6 border border-vcb-mid-grey rounded-lg shadow-sm">
        <table className="min-w-full border-collapse" {...props} />
      </div>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thead: ({...props}: any) => <thead className="bg-vcb-black text-white" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tbody: ({...props}: any) => <tbody className="bg-white divide-y divide-vcb-light-grey" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    th: ({...props}: any) => <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    td: ({...props}: any) => <td className="px-6 py-4 text-sm whitespace-normal" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tr: ({...props}: any) => <tr className="hover:bg-gray-50 transition-colors duration-150" {...props} />,
    // Code blocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({inline, ...props}: any) =>
      inline ? (
        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-vcb-black" {...props} />
      ) : (
        <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono text-sm my-3" {...props} />
      ),
    // Lists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul: ({...props}: any) => <ul className="list-disc list-inside my-3 space-y-1.5 ml-4" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol: ({...props}: any) => <ol className="list-decimal list-inside my-3 space-y-1.5 ml-4" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li: ({...props}: any) => <li className="leading-relaxed" {...props} />,
    // Blockquotes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockquote: ({...props}: any) => (
      <blockquote className="border-l-4 border-vcb-mid-grey bg-gray-50 pl-4 py-2 my-4 italic text-gray-700" {...props} />
    ),
    // Links
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({...props}: any) => (
      <a className="text-vcb-black underline hover:text-vcb-mid-grey transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
    ),
    // Horizontal rule
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hr: ({...props}: any) => <hr className="my-6 border-t-2 border-vcb-light-grey" {...props} />,
    // Strong/Bold
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strong: ({...props}: any) => <strong className="font-bold" {...props} />,
    // Emphasis/Italic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em: ({...props}: any) => <em className="italic" {...props} />,
  }), [processIcons]);

  // Format session time as HH:MM:SS
  const formatSessionTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Session timer - update every 60 seconds for performance
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      setSessionTime(elapsed);
    }, 60000); // Update every 60 seconds for optimal performance

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load tier from usage tracker on mount
  useEffect(() => {
    const usage = usageTrackerRef.current.getUsage();
    setUserTier(usage.tier);
  }, []);

  const initializeSpeechSynthesis = () => {
    // Initialize speech synthesis with a dummy utterance (required for mobile)
    if (!speechInitialized) {
      const dummyUtterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(dummyUtterance);
      setSpeechInitialized(true);
      // console.log('Speech synthesis initialized for mobile');

      // Load voices after initialization
      setTimeout(() => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices);
          // console.log('Voices loaded after initialization:', voices.length);
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
            // console.error('Failed to restart recognition after stopping TTS:', err);
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
        // console.log('Paused recognition for TTS playback');
      } catch (err) {
        // console.error('Failed to pause recognition:', err);
      }
    }

    // Create speech synthesis utterance with en-ZA voice
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = isMobile ? 1.2 : 1.2; // 1.2x speed for mobile and desktop
    utterance.pitch = 1.0;

    // Try to find best available voice - MUST be en-ZA (South African English)
    const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
    // console.log('Selecting voice from', voices.length, 'available voices');

    // Search for en-ZA voice (check multiple formats: en-ZA, en_ZA, en-za)
    const zaVoice = voices.find(voice =>
      voice.lang === 'en-ZA' ||
      voice.lang === 'en_ZA' ||
      voice.lang.toLowerCase() === 'en-za' ||
      voice.name.toLowerCase().includes('south africa')
    );

    if (zaVoice) {
      utterance.voice = zaVoice;
      utterance.lang = 'en-ZA';
      // console.log('✓ Using en-ZA voice:', zaVoice.name);
    } else {
      // No en-ZA available - use en-GB as closest alternative, but log warning
      const gbVoice = voices.find(voice => voice.lang === 'en-GB');
      const usVoice = voices.find(voice => voice.lang === 'en-US');
      const anyEnglish = voices.find(voice => voice.lang.startsWith('en'));

      const fallbackVoice = gbVoice || usVoice || anyEnglish;

      if (fallbackVoice) {
        utterance.voice = fallbackVoice;
        utterance.lang = fallbackVoice.lang;
        // console.warn('⚠ en-ZA voice not available! Using fallback:', fallbackVoice.name, fallbackVoice.lang);
      } else {
        utterance.lang = 'en-ZA'; // Force en-ZA lang even without specific voice
        // console.warn('⚠ No English voices found! Using system default with en-ZA language tag');
      }
    }

    utterance.onstart = () => {
      // console.log('TTS started');
      setSpeakingIndex(index);
    };

    utterance.onend = () => {
      // console.log('TTS ended');
      setSpeakingIndex(null);
      // Restart speech recognition after TTS finishes (if voice mode still enabled)
      // Skip on mobile to prevent conflicts
      if (voiceModeEnabled && recognitionRef.current && !isMobile) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
            // console.log('Resumed recognition after TTS playback');
          } catch (err) {
            // console.error('Failed to restart recognition after TTS:', err);
          }
        }, 500); // 500ms delay to ensure TTS has fully stopped
      }
    };

    utterance.onerror = () => {
      // console.error('TTS error:', event);
      setSpeakingIndex(null);
      // Restart recognition on error too (skip on mobile)
      if (voiceModeEnabled && recognitionRef.current && !isMobile) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch (err) {
            // console.error('Failed to restart recognition after TTS error:', err);
          }
        }, 500);
      }
    };

    // console.log('Starting TTS playback');
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
      // console.error('Failed to copy text:', err);
    }
  };

  // Load voices when component mounts
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // console.log('Available voices:', voices.length);
      // console.log('Voice list:', voices.map(v => `${v.name} (${v.lang})`));
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
      // console.error('Speech Recognition API not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-ZA'; // South African English

    recognition.onstart = () => {
      // console.log('Speech recognition started');
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');

      // console.log('Transcript:', transcript);
      setInput(transcript);

      // Reset silence timer on speech
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Start new silence timer (3 seconds)
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim()) {
          // console.log('Silence detected, submitting...');
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
      // console.error('Speech recognition error:', event.error);
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
              // console.error('Failed to restart after error:', err);
            }
          }, 1000);
        }
      }
    };

    recognition.onend = () => {
      // console.log('Speech recognition ended');
      setIsListening(false);

      // Auto-restart if voice mode is still enabled
      if (voiceModeEnabled) {
        setTimeout(() => {
          try {
            recognition.start();
            // console.log('Restarting recognition...');
          } catch (err) {
            // console.error('Failed to restart recognition:', err);
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
          // console.error('Failed to start recognition:', err);
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

  // Conversation Management Functions
  const saveCurrentConversation = () => {
    if (messages.length === 0) return;

    const messagesWithTimestamps: Message[] = messages.map((msg, index) => ({
      ...msg,
      timestamp: msg.timestamp || Date.now() + index,
    }));

    if (currentConversationId) {
      // Update existing conversation
      conversationManagerRef.current.updateConversation(currentConversationId, messagesWithTimestamps);
      // console.log('Updated conversation:', currentConversationId);
    } else {
      // Create new conversation
      const newConv = conversationManagerRef.current.createConversation(messagesWithTimestamps);
      setCurrentConversationId(newConv.id);
      // console.log('Created new conversation:', newConv.id);
    }
  };

  const loadConversation = (id: string) => {
    const conv = conversationManagerRef.current.getConversation(id);
    if (conv) {
      // Use startTransition to make conversation loading non-blocking
      startTransition(() => {
        setMessages(conv.messages);
        setCurrentConversationId(id);
        setShowChatHistory(false);
      });
      // console.log('Loaded conversation:', id, conv.title);
    }
  };

  const createNewChat = () => {
    // Save current conversation before starting new one
    if (messages.length > 0) {
      saveCurrentConversation();
    }

    // Clear current chat
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setShowChatHistory(false);
    // console.log('Started new chat');
  };

  const deleteConversationById = (id: string) => {
    const deleted = conversationManagerRef.current.deleteConversation(id);
    if (deleted) {
      // If we deleted the current conversation, clear the chat
      if (id === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
      }
      // console.log('Deleted conversation:', id);
    }
  };

  const exportConversation = (id: string, format: 'json' | 'text') => {
    const exported = format === 'json'
      ? conversationManagerRef.current.exportToJSON(id)
      : conversationManagerRef.current.exportToText(id);

    if (exported) {
      const blob = new Blob([exported], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation_${id}.${format === 'json' ? 'json' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // console.log('Exported conversation:', id, format);
    }
  };

  // Auto-save conversation when messages change (debounced for performance)
  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        saveCurrentConversation();
      }, 5000); // Auto-save after 5 seconds of inactivity (increased from 2s for better performance)

      return () => clearTimeout(timeoutId);
    }
  }, [messages]);

  // Generate image using Cerebras Vision API
  const generateImage = async (prompt: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error('VITE_CEREBRAS_API_KEY not found in environment variables');
    }

    try {
      // Try the image generation API endpoint
      const response = await fetch('https://api.cerebras.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'flux-dev',
          prompt: prompt,
          width: 1024,
          height: 1024,
          steps: 50,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Image generation not available (${response.status})`);
      }

      const data = await response.json();

      // Handle different response formats
      if (data.data && data.data[0] && data.data[0].url) {
        return data.data[0].url;
      } else if (data.data && data.data[0] && data.data[0].b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      } else if (data.image) {
        return data.image;
      } else if (data.imageUrl) {
        return data.imageUrl;
      } else {
        throw new Error('No image data in response');
      }
    } catch (error) {
      // console.error('Image generation error:', error);
      throw new Error('Image generation is currently unavailable. Please try text-based questions instead.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Check if this is an image generation request
    if (isImageGenerationRequest(userMessage.content)) {
      try {
        const imagePrompt = extractImagePrompt(userMessage.content);
        // console.log('Image generation requested. Prompt:', imagePrompt);

        const imageUrl = await generateImage(imagePrompt);

        const imageMessage: Message = {
          role: 'assistant',
          content: `Generated image: "${imagePrompt}"`,
          timestamp: Date.now(),
          type: 'image',
          imageUrl: imageUrl,
          imagePrompt: imagePrompt,
        };

        setMessages((prev) => [...prev, imageMessage]);
        // console.log('Image generated successfully:', imageUrl);
      } catch (error: any) {
        // console.error('Image generation failed:', error);
        const errorMsg: Message = {
          role: 'assistant',
          content: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }

      setIsLoading(false);
      inputRef.current?.focus();
      return;
    }

    // Normal text chat logic
    // Retry logic with exponential backoff for rate limiting
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        // Initialize VCB-AI client (Cerebras backend)
        const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
        if (!apiKey) {
          throw new Error('VITE_CEREBRAS_API_KEY not found in environment variables');
        }

        const client = new Cerebras({
          apiKey: apiKey,
          maxRetries: 0,  // Disable automatic retries to prevent 429 cascades
        });

        // Smart Router: Detect if query requires Qwen thinking model
        const requiresComplexReasoning = (query: string): boolean => {
          const queryLower = query.toLowerCase();
          const wordCount = query.split(' ').length;
          
          // Only use Qwen for:
          // 1. Long detailed questions (20+ words)
          const isLongQuery = wordCount > 20;
          
          // 2. Questions with complex reasoning indicators
          const hasComplexQuestionPattern = /\b(why|how|what if|should i|hoekom|hoe|wat as|moet ek|kungani|kanjani)\b/i.test(query);
          
          // 3. Legal terms in multiple SA languages
          const legalKeywords = [
            'wet', 'hof', 'regs', 'grondwet', 'prokureur', 'advokaat', // Afrikaans
            'umthetho', 'inkantolo', // Zulu: law, court
            'molao', 'lekgotla', // Sotho: law, court
          ];
          const hasLegalTerms = legalKeywords.some(keyword => queryLower.includes(keyword));
          
          // Use Qwen ONLY if: long query OR (complex question + legal terms)
          return isLongQuery || (hasComplexQuestionPattern && hasLegalTerms);
        };

        // Determine which model to use (default to Llama for speed)
        const useThinkingModel = requiresComplexReasoning(userMessage.content);
        const selectedModel = useThinkingModel 
          ? 'qwen-3-235b-a22b-instruct-2507'  // Long/complex legal queries only
          : 'llama-3.3-70b';                    // Default for everything else

        // Adjust system prompt based on model
        const systemPromptContent = useThinkingModel
          ? `IDENTITY: You are GOGGA (Afrikaans for "scary bug"), created by VCB-AI (CEO: Ms Dawn Beech, vcb-ai.online). Premium SA legal-tech LLM with 1M token context. Pretoria datacenter. Trained in 11 SA official languages. Expert in judicial reasoning, precedent analysis, outcome prediction. Always introduce as "I'm GOGGA" or "Ek is GOGGA".

CORE REASONING (SA Framework):
• Generate 3-5 solution approaches (K branches), score each: Coverage (0-10), Novelty (0-10), SA-law Feasibility (0-10)
• Keep top 2-3 branches, merge best elements into single coherent response
• Prioritize: SA Constitution, Bill of Rights, ConCourt precedents, customary law, Rainbow Nation values
• Anti-hallucination: Cite sources for factual claims (especially legal/technical), fact-check against SA legislation/gazettes/judgments
• Flag uncertainty explicitly - NEVER fabricate information
• NEVER show internal reasoning/scoring/deliberation to user - only final polished answer

LANGUAGE MIRRORING (CRITICAL):
• Respond in EXACT language user uses: English→English, Afrikaans→Afrikaans, Zulu→Zulu, etc.
• Maintain consistency throughout conversation
• Exception: Legal citations/case names stay in original language

CONTEXT-AWARE TONE (CRITICAL):
• Start friendly/casual for general queries (cooking, tech, culture, sports, greetings)
• ONLY shift to formal legal tone for actual legal questions
• Match user's formality level
• Examples: "Hello"→friendly greeting | "Cape Town?"→casual travel info | "Eviction law?"→formal legal analysis with citations

TEMPORAL AWARENESS:
• Current date: November 2025 (YOU ARE IN 2025, NOT 2024)
• Reference point: "this year"=2025, "last year"=2024, "next year"=2026
• Use 2025 statutes/amendments/case law when discussing current SA legal developments

FORMATTING RULES (CRITICAL):
• Use Material Icons: [gavel] [account_balance] [policy] [verified] [lightbulb] [build]
• NEVER use emojis (🏛️❌ → [account_balance]✓)
• NEVER use horizontal rules: ---, ___, *** (FORBIDDEN - breaks formatting)
• Use blank lines for spacing
• Tables: Proper markdown with blank line before table:

| Header 1 | Header 2 |
|----------|----------|
| Data 1   | Data 2   |

• Exception: NO icons in legal documents/court applications/formal legal advice
• Clean professional formatting, clear headings, organized lists

TONE: Expert, friendly, solution-focused, SA proud. Subtle humor where appropriate. EXCEPTION: Completely serious in legal documents/court applications/formal legal advice.`
          : `IDENTITY: You are GOGGA (Afrikaans for "scary bug"), created by VCB-AI (CEO: Ms Dawn Beech, vcb-ai.online). SA-trained AI assistant with personality! You're friendly, helpful, and uniquely South African. Always introduce as "I'm GOGGA" or "Ek is GOGGA" with enthusiasm.

CORE RULES:
• Respond in EXACT language user uses (English→English, Afrikaans→Afrikaans, Zulu→Zulu, etc.)
• Current date: November 2025 (you are in 2025, not 2024)
• Be conversational, warm, and engaging - you're chatting with a friend, not writing a manual
• Show personality: use SA slang, local references, be relatable
• Examples: "Howzit!" "Lekker!" "Sharp sharp!" "Eish!" (when appropriate)

FORMATTING:
• Sparingly use fun icons for emphasis: [lightbulb] [verified] [schedule] [home] [restaurant]
• NEVER use technical/developer icons like [bug_report] [build] [code] [database]
• NEVER use emojis (use icons instead)
• NEVER use horizontal rules: ---, ___, *** (FORBIDDEN)
• Keep it clean and readable

TONE: Friendly, warm, helpful, genuinely South African. You're GOGGA - not a boring assistant, but a helpful friend with character. Be personable, enthusiastic, and make people smile while being useful!`;

        // Create chat completion with VCB-AI system prompt
        const systemMessage = {
          role: 'system' as const,
          content: systemPromptContent
        };

        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: [
            systemMessage,
            ...[...messages, userMessage].map((msg) => ({
              role: msg.role,
              content: msg.content,
            }))
          ],
          temperature: 0.0,  // Deterministic for consistent icon choices (A2C)
          top_p: 0.85,       // Limit sampling for consistency
          max_tokens: 4096,  // Prevent runaway token usage on complex queries
          stream: false,
        });

        // Process content ONCE when creating message (not on every render)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawContent = ((response.choices as any)[0]?.message?.content as string) || 'No response received';
        
        // Add model indicator for debugging/transparency (optional - can remove in production)
        const modelIndicator = useThinkingModel 
          ? '' // Don't show indicator for Qwen (premium experience)
          : ''; // Don't show indicator for Llama either (clean UI)
        
        const processedContent = fixMarkdownTables(enforceFormatting(normalizeIcons(rawContent + modelIndicator)));

        const assistantMessage: Message = {
          role: 'assistant',
          content: processedContent,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Track usage for pricing/billing
        usageTrackerRef.current.trackMessage(userMessage.content, assistantMessage.content);
        // console.log('Usage tracked:', usageTrackerRef.current.getUsage());

        // Success - exit retry loop
        break;
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const is429 = errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('too many requests');

        if (is429 && retryCount < maxRetries) {
          // Rate limited - wait and retry with exponential backoff
          const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          // console.log(`Rate limited (429). Retrying in ${delayMs/1000}s... (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          retryCount++;
          continue;
        } else {
          // Non-429 error or max retries reached - show error to user
          // console.error('Error calling VCB-AI API:', error);
          const errorMsg: Message = {
            role: 'assistant',
            content: is429
              ? `I'm experiencing high demand right now. Please try again in a moment.`
              : `Error: ${error instanceof Error ? error.message : 'Failed to get response from VCB-AI'}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          break;
        }
      }
    }

    setIsLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white font-quicksand font-normal">
      {/* Header - VCB Cleaner Theme per §5.1-5.3, Mobile Optimized */}
      <header className="bg-vcb-black border-b border-vcb-mid-grey px-3 py-1.5 md:px-8 md:py-6">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-1.5 md:space-x-6">
            {/* VCB Logo per §5.3 - must be on dark background */}
            <a
              href="https://vcb-ai.online"
              target="_blank"
              rel="noopener noreferrer"
              title="Visit VCB-AI"
              className="transition-opacity hover:opacity-80"
            >
              <img
                src="https://i.postimg.cc/xdJqP9br/logo-transparent-Black-Back.png"
                alt="VCB Logo"
                className="h-12 md:h-32"
              />
            </a>
            <div className="text-left">
              <h1 className="text-xs md:text-xl font-bold text-vcb-white tracking-wider">
                GOGGA (BETA)
              </h1>
              <p className="text-vcb-white text-[8px] md:text-xs mt-0 md:mt-0.5 font-medium uppercase tracking-wide">
                Powered by VCB-AI
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Chat History Button */}
            <button
              type="button"
              onClick={() => setShowChatHistory(!showChatHistory)}
              className="flex items-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors"
              title="Chat History"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
              </svg>
              <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">History</span>
            </button>

            {/* Session Timer */}
            <div className="flex items-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white">
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
              </svg>
              <span className="text-[10px] md:text-xs font-mono font-medium tracking-wide">
                {formatSessionTime(sessionTime)}
              </span>
            </div>

            {/* Usage Stats Button */}
            <button
              type="button"
              onClick={() => setShowUsage(!showUsage)}
              className="flex items-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors"
              title="View Usage & Pricing"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
              </svg>
              <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">Usage</span>
            </button>

            {/* Voice Mode Toggle Button - HIDDEN */}
            <button
              type="button"
              onClick={toggleVoiceMode}
              className={`hidden flex items-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border transition-colors ${
                voiceModeEnabled
                  ? 'bg-vcb-white text-vcb-black border-vcb-white'
                  : 'bg-vcb-black text-vcb-white border-vcb-mid-grey hover:border-vcb-white'
              }`}
              title={voiceModeEnabled ? 'Stop Voice Mode' : 'Start Voice Mode (en-ZA)'}
            >
              {voiceModeEnabled && isListening ? (
                <svg className="w-4 h-4 md:w-5 md:h-5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
              <span className="hidden md:inline text-xs font-medium uppercase tracking-wide">
                {voiceModeEnabled ? 'Voice On' : 'Voice Mode'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Chat History Modal */}
      {showChatHistory && (
        <div className="fixed inset-0 bg-vcb-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowChatHistory(false)}>
          <div className="bg-white border border-vcb-light-grey max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-vcb-black border-b border-vcb-mid-grey px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-vcb-white uppercase tracking-wider">Chat History</h2>
                <button
                  onClick={() => setShowChatHistory(false)}
                  className="text-vcb-white hover:text-vcb-light-grey transition-colors"
                  title="Close"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>

              {/* Search Bar */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="flex-1 bg-white text-vcb-black border border-vcb-mid-grey px-3 py-2 text-sm focus:outline-none focus:border-vcb-white"
                />
                <button
                  onClick={createNewChat}
                  className="px-4 py-2 bg-vcb-white text-vcb-black text-xs font-medium uppercase tracking-wide hover:bg-vcb-light-grey transition-colors border border-vcb-white"
                  title="New Chat"
                >
                  + New Chat
                </button>
              </div>
            </div>

            {/* Modal Content - Conversation List */}
            <div className="px-6 py-4">
              {(() => {
                const conversations = searchQuery
                  ? conversationManagerRef.current.searchConversations(searchQuery)
                  : conversationManagerRef.current.getAllConversations();

                if (conversations.length === 0) {
                  return (
                    <div className="text-center py-12 text-vcb-mid-grey">
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                      </svg>
                      <p className="text-sm uppercase">
                        {searchQuery ? 'No conversations found' : 'No chat history yet'}
                      </p>
                      <p className="text-xs mt-2">
                        {searchQuery ? 'Try a different search term' : 'Start a conversation to see it here'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {conversations.map((conv) => {
                      const isActive = conv.id === currentConversationId;
                      const messageCount = conv.messages.length;
                      const lastUpdate = new Date(conv.updatedAt).toLocaleDateString();

                      return (
                        <div
                          key={conv.id}
                          className={`border p-4 transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-vcb-light-grey border-vcb-black'
                              : 'bg-white border-vcb-light-grey hover:border-vcb-mid-grey'
                          }`}
                          onClick={() => loadConversation(conv.id)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                {conv.isPinned && (
                                  <svg className="w-4 h-4 text-vcb-mid-grey" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                                  </svg>
                                )}
                                <h3 className="text-sm font-medium text-vcb-black line-clamp-1">{conv.title}</h3>
                              </div>
                              <div className="flex items-center space-x-3 text-xs text-vcb-mid-grey">
                                <span>{messageCount} messages</span>
                                <span>•</span>
                                <span>{lastUpdate}</span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-1 ml-2" onClick={(e) => e.stopPropagation()}>
                              {/* Pin/Unpin */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  conversationManagerRef.current.togglePin(conv.id);
                                  setShowChatHistory(false);
                                  setTimeout(() => setShowChatHistory(true), 0);
                                }}
                                className="p-1.5 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                                title={conv.isPinned ? 'Unpin' : 'Pin'}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                                </svg>
                              </button>

                              {/* Rename */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTitle = prompt('Enter new title:', conv.title);
                                  if (newTitle && newTitle.trim()) {
                                    conversationManagerRef.current.renameConversation(conv.id, newTitle.trim());
                                    setShowChatHistory(false);
                                    setTimeout(() => setShowChatHistory(true), 0);
                                  }
                                }}
                                className="p-1.5 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                                title="Rename"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                </svg>
                              </button>

                              {/* Export */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const format = confirm('Export as JSON? (Cancel for plain text)') ? 'json' : 'text';
                                  exportConversation(conv.id, format);
                                }}
                                className="p-1.5 text-vcb-mid-grey hover:text-vcb-black transition-colors"
                                title="Export"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
                                </svg>
                              </button>

                              {/* Delete */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete "${conv.title}"? This cannot be undone.`)) {
                                    deleteConversationById(conv.id);
                                    setShowChatHistory(false);
                                    setTimeout(() => setShowChatHistory(true), 0);
                                  }
                                }}
                                className="p-1.5 text-vcb-mid-grey hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Stats Footer */}
              {(() => {
                const stats = conversationManagerRef.current.getStats();
                return (
                  <div className="mt-6 pt-4 border-t border-vcb-light-grey">
                    <div className="grid grid-cols-3 gap-4 text-center text-xs">
                      <div>
                        <p className="text-vcb-mid-grey uppercase">Total</p>
                        <p className="text-vcb-black font-bold text-lg">{stats.total}</p>
                      </div>
                      <div>
                        <p className="text-vcb-mid-grey uppercase">Pinned</p>
                        <p className="text-vcb-black font-bold text-lg">{stats.pinned}</p>
                      </div>
                      <div>
                        <p className="text-vcb-mid-grey uppercase">Messages</p>
                        <p className="text-vcb-black font-bold text-lg">{stats.totalMessages}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Usage & Pricing Modal */}
      {showUsage && (
        <div className="fixed inset-0 bg-vcb-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowUsage(false)}>
          <div className="bg-white border border-vcb-light-grey max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-vcb-black border-b border-vcb-mid-grey px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-vcb-white uppercase tracking-wider">Usage & Pricing</h2>
              <button
                onClick={() => setShowUsage(false)}
                className="text-vcb-white hover:text-vcb-light-grey transition-colors"
                title="Close"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-6 space-y-6">
              {/* Current Usage */}
              <div className="border border-vcb-light-grey px-6 py-4">
                <h3 className="text-base font-medium uppercase tracking-wide mb-4 text-vcb-black">Current Usage</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-vcb-mid-grey uppercase text-xs font-medium">Tier</p>
                    <p className="text-vcb-black font-bold text-lg uppercase">{usageTrackerRef.current.getUsage().tier}</p>
                  </div>
                  <div>
                    <p className="text-vcb-mid-grey uppercase text-xs font-medium">Conversations</p>
                    <p className="text-vcb-black font-bold text-lg">{usageTrackerRef.current.getUsage().conversations}</p>
                  </div>
                  <div>
                    <p className="text-vcb-mid-grey uppercase text-xs font-medium">Total Tokens</p>
                    <p className="text-vcb-black font-bold text-lg">{usageTrackerRef.current.getUsage().tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-vcb-mid-grey uppercase text-xs font-medium">Total Credits</p>
                    <p className="text-vcb-black font-bold text-lg">{usageTrackerRef.current.getUsage().credits}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-vcb-mid-grey uppercase text-xs font-medium">Session Status</p>
                    <p className="text-vcb-black font-medium">
                      {usageTrackerRef.current.getUsage().sessionActive ? '✓ Active' : '○ Inactive'}
                      <span className="text-xs text-vcb-mid-grey ml-2">
                        ({Math.floor(usageTrackerRef.current.getUsage().sessionAge / 60000)} min ago)
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Remaining Chats */}
              <div className="border border-vcb-light-grey px-6 py-4">
                <h3 className="text-base font-medium uppercase tracking-wide mb-4 text-vcb-black">Remaining This Cycle</h3>
                <div className="space-y-3 text-sm">
                  {usageTrackerRef.current.getUsage().tier !== 'pro' && usageTrackerRef.current.getUsage().tier !== 'standard' && (
                    <div className="flex justify-between items-center">
                      <span className="text-vcb-mid-grey uppercase text-xs font-medium">Lite Chats (1 credit)</span>
                      <span className="text-vcb-black font-bold">{usageTrackerRef.current.getUsage().remainingLite}</span>
                    </div>
                  )}
                  {(usageTrackerRef.current.getUsage().tier === 'standard' || usageTrackerRef.current.getUsage().tier === 'pro') && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-vcb-mid-grey uppercase text-xs font-medium">Standard Chats (4 credits)</span>
                        <span className="text-vcb-black font-bold">{usageTrackerRef.current.getUsage().remainingStandard}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-vcb-mid-grey uppercase text-xs font-medium">Premium Chats (10 credits)</span>
                        <span className="text-vcb-black font-bold">{usageTrackerRef.current.getUsage().remainingPremium}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tier Selector (temporary until auth) */}
              <div className="border border-vcb-light-grey px-6 py-4">
                <h3 className="text-base font-medium uppercase tracking-wide mb-4 text-vcb-black">Select Tier (Demo)</h3>
                <div className="flex flex-wrap gap-2">
                  {(['free', 'starter', 'standard', 'pro'] as TierType[]).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => {
                        setUserTier(tier);
                        usageTrackerRef.current.setTier(tier);
                      }}
                      className={`px-4 py-2 border text-xs font-medium uppercase tracking-wide transition-colors ${
                        userTier === tier
                          ? 'bg-vcb-black text-vcb-white border-vcb-black'
                          : 'bg-white text-vcb-black border-vcb-mid-grey hover:border-vcb-black'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-vcb-mid-grey mt-3">* Tier selection will be managed through authentication in production</p>
              </div>

              {/* Pricing Info */}
              <div className="border border-vcb-light-grey px-6 py-4">
                <h3 className="text-base font-medium uppercase tracking-wide mb-4 text-vcb-black">Pricing Tiers</h3>
                <div className="space-y-4 text-sm">
                  <div className="pb-3 border-b border-vcb-light-grey">
                    <p className="font-bold uppercase text-vcb-black">Starter - $5/month</p>
                    <p className="text-vcb-mid-grey">60 Lite chats per cycle</p>
                  </div>
                  <div className="pb-3 border-b border-vcb-light-grey">
                    <p className="font-bold uppercase text-vcb-black">Standard - $18/month</p>
                    <p className="text-vcb-mid-grey">150 Standard + 50 Premium rollovers</p>
                  </div>
                  <div>
                    <p className="font-bold uppercase text-vcb-black">Pro - $39/month</p>
                    <p className="text-vcb-mid-grey">400 Standard + 120 Premium chats</p>
                  </div>
                </div>
                <a
                  href="pricing.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 px-4 py-2 bg-vcb-black text-vcb-white text-xs font-medium uppercase tracking-wide hover:bg-vcb-dark-grey transition-colors"
                >
                  View Full Pricing
                </a>
              </div>

              {/* Reset Button */}
              <div className="border border-vcb-light-grey px-6 py-4">
                <button
                  onClick={() => {
                    if (confirm('Reset all usage data? This cannot be undone.')) {
                      usageTrackerRef.current.reset();
                      setShowUsage(false);
                      setShowUsage(true); // Force re-render
                    }
                  }}
                  className="px-4 py-2 border border-vcb-mid-grey text-vcb-mid-grey text-xs font-medium uppercase tracking-wide hover:border-vcb-black hover:text-vcb-black transition-colors"
                >
                  Reset Usage Data
                </button>
                <p className="text-xs text-vcb-mid-grey mt-2">* Resets conversation count and credits (for testing/new billing cycle)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages Container - 80%+ whitespace per §5.1, Mobile Optimized */}
      <div className="flex-1 overflow-y-auto px-2 py-3 md:px-8 md:py-12">
        <div className="max-w-5xl mx-auto space-y-3 md:space-y-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-vcb-mid-grey py-8 md:py-24">
              <svg
                className="w-12 h-12 md:w-20 md:h-20 mb-4 md:mb-8 stroke-current"
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
              <p className="text-sm md:text-lg font-medium uppercase tracking-wide">
                Start a conversation with GOGGA
              </p>
              <p className="text-xs md:text-sm mt-1 md:mt-3 font-normal">
                Type your message below to get started
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <MessageComponent
                key={index}
                message={message}
                index={index}
                onCopy={handleCopy}
                onSpeak={handleSpeak}
                copiedIndex={copiedIndex}
                speakingIndex={speakingIndex}
                markdownComponents={markdownComponents}
              />
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-3xl border border-vcb-light-grey bg-white px-4 py-3 md:px-8 md:py-6">
                <div className="flex items-center space-x-2 md:space-x-4">
                  <img
                    src="sovereign-chat-icon-static.svg"
                    alt="VCB-AI"
                    className="w-8 h-8 md:w-10 md:h-10"
                  />
                  <img
                    src="sovereign-thinking-spinner.svg"
                    alt="Thinking..."
                    className="w-8 h-8 md:w-10 md:h-10"
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Container - high contrast per §5.1, Mobile Optimized */}
      <div className="border-t border-vcb-light-grey bg-white px-2 py-2 md:px-8 md:py-6">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
          {voiceModeEnabled && isListening && (
            <div className="mb-2 md:mb-3 flex items-center justify-center space-x-2 text-vcb-mid-grey">
              <svg className="w-3 h-3 md:w-4 md:h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              <span className="text-[10px] md:text-sm font-medium uppercase">Listening...</span>
            </div>
          )}
          <div className="flex items-center space-x-1.5 md:space-x-4">
            <img
              src="Sovereign-Chat-icon-Spin.svg"
              alt="Sovereign"
              className="h-10 w-10 md:h-16 md:w-16 flex-shrink-0"
            />
            <textarea
              id="chat-input"
              name="message"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceModeEnabled ? "Speak your message..." : "Type your message..."}
              className="flex-1 bg-white text-vcb-black border border-vcb-light-grey px-2 py-2 md:px-6 md:py-4 text-sm md:text-base focus:outline-none focus:border-vcb-mid-grey resize-none font-normal leading-relaxed"
              rows={1}
              disabled={isLoading}
              readOnly={voiceModeEnabled}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white px-3 py-2 md:px-8 md:py-4 text-[10px] md:text-sm font-medium uppercase tracking-wider transition-colors duration-200 flex items-center space-x-1 md:space-x-3 border border-vcb-mid-grey"
            >
              {isLoading ? (
                <>
                  <img
                    src="sovereign-thinking-spinner.svg"
                    alt="Sending..."
                    className="h-4 w-4 md:h-5 md:w-5"
                  />
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
