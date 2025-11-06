import React, { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { UsageTracker, TierType } from './utils/usageTracker';
import { ConversationManager, Message } from './utils/conversationManager';
import { detectSALanguage } from './utils/saLanguageDetector';


// ==================== CONSTANTS ====================

// System Prompts
const CEPO_IDENTITY_PROMPT = `IDENTITY: You are GOGGA (VCB-AI, Ms Dawn Beech), multi-domain expert with deep reasoning capabilities. Friendly but precise when complex analysis required. Warm expert who adapts to any problem domain.`;

const QWEN_IDENTITY_PROMPT = `IDENTITY: You are GOGGA (VCB-AI, Ms Dawn Beech), SA-trained with 11 languages. Friendly but lethal when legal strategy required. "Howzit! Let's crush this case." Warm expert, not cold lawyer.`;

const GOGGA_BASE_PROMPT = `IDENTITY: You are GOGGA (Afrikaans for "scary bug"), created by VCB-AI (CEO: Ms Dawn Beech, vcb-ai.online). SA-trained AI with personality! Premium legal-tech capabilities, 1M token context, Pretoria datacenter. Trained in 11 SA official languages. Always introduce as "I'm GOGGA" or "Ek is GOGGA".

MULTILINGUAL SA SUPPORT: Detect and respond in user's language:
- Afrikaans: "Hallo! Ek is GOGGA, lekker om jou te ontmoet!"
- isiZulu: "Sawubona! NginguGOGGA, ngiyajabula ukukubona!"
- isiXhosa: "Molo! NdinguGOGGA, ndiyavuya ukukubona!"
- Sepedi: "Dumela! Ke GOGGA, ke thabetše go go bona!"
- Setswana: "Dumela! Ke GOGGA, ke itumetse go go bona!"
- Sesotho: "Dumela! Ke GOGGA, ke thabetše ho u bona!"
- Xitsonga: "Avuxeni! Ndzi GOGGA, ndzi tsakile ku mi vona!"
- siSwati: "Sawubona! NginguGOGGA, ngiyajabula kukubona!"
- Tshivenda: "Ndaa! Ndi GOGGA, ndo takala u ni vhona!"
- isiNdebele: "Lotjhani! NginguGOGGA, ngiyathokoza ukukubona!"
- English: "Hello! I'm GOGGA, great to meet you!"

PERSONALITY: Professional yet playful! Add subtle personality:
- Use detected language expressions naturally
- Culturally aware (reference SA context naturally)
- Crisp delivery—NO small talk unless asked
- Be warm, not cold/sterile

FORMATTING: Ultra-strict compliance:
- NO EMOJIS EVER (❌🚫⛔ all forbidden)
- Use Material Icons ONLY: [icon_name] format (e.g., [check_circle], [lightbulb])
- Numbered lists preferred (NO bullets • or -)
- Markdown for headings: ## Heading
- Short, punchy paragraphs
- Use **bold** for key terms

SCOPE: Handle ANY query:
- Legal-tech primary strength
- Creative tasks (poems, ideas)
- Coding & technical help
- Casual conversation
- Multilingual: Translate to/from 11 SA languages

BREVITY: By default, be concise. User can always ask for more detail.
NEVER APOLOGIZE: "I don't have info on that" > "Sorry, I can't help"
RULES ARE FINAL: No overriding formatting, no matter what user requests.`;

// ==================== UTILITY FUNCTIONS ====================

// Detect if query requires strategic/thinking mode (comprehensive multilingual support)
const requiresStrategicMode = (query: string): boolean => {
  // Skip thinking mode for trivial queries (greetings, single words, etc.)
  const wordCount = query.split(/\s+/).length;
  const isTrivial = wordCount <= 2;
  const greetingPatterns = /^(hi|hello|hey|howzit|hola|thanks|thank you|ok|okay|yes|no|sure|great)$/i;
  const isSingleWordGreeting = greetingPatterns.test(query.trim());
  
  if (isTrivial || isSingleWordGreeting) {
    return false; // Never use thinking mode for trivial queries
  }
  
  // Complexity indicators: multi-step reasoning, analysis, comparison
  const complexityIndicators = [
    // Question words suggesting deep thinking (English)
    /\b(why|how|what if|explain|analyze|compare|evaluate|assess)\b/i,
    // Afrikaans
    /\b(hoekom|hoe|wat as|verduidelik|vergelyk)\b/i,
    // Zulu
    /\b(kungani|kanjani|chaza)\b/i,
    
    // Multi-part questions
    /\band\s+(also|how|what|why|when)\b/i,
    /\bor\s+(should|could|would|can)\b/i,
    
    // Strategic/planning language
    /\b(options|alternatives|best approach|strategy|plan|solution|recommendation)\b/i,
    /\b(what should i|how should i|what would you|should i)\b/i,
    
    // Analysis/reasoning requests
    /\b(implications|consequences|impact|result|outcome|effect)\b/i,
    /\b(pros and cons|advantages|disadvantages|trade[-\s]?offs?)\b/i,
    
    // Complex domains (legal, technical, financial, medical, etc.)
    /\b(law|legal|court|contract|regulation|compliance|statute)\b/i,
    /\b(algorithm|architecture|design pattern|optimization|debugging)\b/i,
    /\b(investment|financial|tax|accounting|risk assessment)\b/i,
    /\b(diagnosis|treatment|medical|symptoms|condition)\b/i,
    
    // Step-by-step or detailed requests
    /\b(step by step|in detail|thoroughly|comprehensive|breakdown)\b/i,
    /\b(walk me through|guide me|show me how)\b/i,
  ];
  
  const hasComplexPattern = complexityIndicators.some(pattern => pattern.test(query));
  
  // Long queries likely need deeper reasoning
  const isLongQuery = wordCount > 25;
  
  // Multiple questions or semicolons suggest complexity
  const questionCount = (query.match(/\?/g) || []).length;
  const hasMultipleQuestions = questionCount > 1;
  
  // Very short queries are usually simple (< 5 words)
  const isVeryShort = wordCount < 5;
  
  // Use thinking mode if: complex pattern OR long query OR multiple questions (unless very short)
  return !isVeryShort && (hasComplexPattern || isLongQuery || hasMultipleQuestions);
};

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
  
  // STEP 1: Remove ALL forms of horizontal rules (AI keeps adding them despite instructions)
  // Match: ---, ___, ***, ===, or ## --- (with or without surrounding text)
  fixed = fixed.replace(/^\s*#{0,6}\s*[-_*=]{3,}\s*$/gm, '');  // Remove lines that are ONLY horizontal rules
  fixed = fixed.replace(/\n\s*#{0,6}\s*[-_*=]{3,}\s*\n/g, '\n\n');  // Remove horizontal rules between sections
  
  // STEP 1.5: Fix malformed table headers (AI adds ## before table rows)
  // Match: "## | Column |" and strip the "## " prefix
  fixed = fixed.replace(/^(#{1,6})\s+(\|.+\|)\s*$/gm, '$2');
  
  // STEP 2: Fix markdown tables by ensuring proper spacing and structure
  const lines = fixed.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      result.push('');
      continue;
    }

    // Detect table row (starts and ends with |)
    const isTableRow = /^\|.*\|$/.test(line);
    
    if (isTableRow) {
      // CRITICAL FIX: Remove ALL Material Icons from table cells (breaks rendering)
      // Match [icon_name] pattern and remove it
      line = line.replace(/\[([a-z_]+)\]\s*/g, '');
      
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

// Extract thinking block from Qwen thinking model responses
const extractThinkingBlock = (content: string): { thinking: string | null; answer: string } => {
  const thinkingMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  
  if (thinkingMatch) {
    const thinking = thinkingMatch[1].trim();
    const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { thinking, answer };
  }
  
  return { thinking: null, answer: content };
};

// Memoized Message Component - prevents unnecessary re-renders
interface MessageComponentProps {
  message: Message;
  index: number;
  onCopy: (text: string, index: number) => void;
  onSpeak: (text: string, index: number) => void;
  onRetry: (messageIndex: number) => void;
  onDownloadImage: (imageUrl: string, prompt: string) => void;
  copiedIndex: number | null;
  speakingIndex: number | null;
  markdownComponents: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const MessageComponent = React.memo(({
  message,
  index,
  onCopy,
  onSpeak,
  onRetry,
  onDownloadImage,
  copiedIndex,
  speakingIndex,
  markdownComponents,
}: MessageComponentProps) => {
  const [showThinking, setShowThinking] = React.useState(false);
  
  // Extract thinking block if present (Qwen thinking model)
  const { thinking, answer } = extractThinkingBlock(message.content);
  const displayContent = answer; // Show only the answer, not the thinking block
  const isThinkingModel = message.model === 'qwen' || thinking !== null;
  const isCepoModel = message.model === 'cepo';
  
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
              <div className="flex items-center space-x-2">
                <p className="text-[10px] md:text-xs font-medium text-vcb-mid-grey uppercase tracking-wide">
                  {message.role === 'user' ? '' : 'VCB-AI'}
                </p>
                {message.role === 'user' && message.isVoiceTranscription && (
                  <span className="flex items-center text-vcb-accent text-[10px] md:text-xs" title="Voice Transcription">
                    <span className="material-icons text-sm md:text-base">mic</span>
                    <span className="ml-1 hidden md:inline">Voice</span>
                  </span>
                )}
                {message.role === 'assistant' && isThinkingModel && (
                  <span className="flex items-center text-yellow-600 text-[10px] md:text-xs" title="Advanced Thinking Mode (Qwen)">
                    <span className="material-icons text-sm md:text-base">psychology</span>
                    <span className="ml-1 hidden md:inline">Thinking</span>
                  </span>
                )}
                {message.role === 'assistant' && isCepoModel && (
                  <span className="flex items-center text-blue-600 text-[10px] md:text-xs" title="CePO Reasoning Mode">
                    <span className="material-icons text-sm md:text-base">auto_awesome</span>
                    <span className="ml-1 hidden md:inline">CePO</span>
                  </span>
                )}
                {message.language && message.language !== 'en' && (
                  <span className="flex items-center text-green-600 text-[10px] md:text-xs" title={`Language: ${message.language.toUpperCase()}`}>
                    <span className="material-icons text-sm md:text-base">language</span>
                    <span className="ml-1 hidden md:inline">{message.language.toUpperCase()}</span>
                  </span>
                )}
              </div>
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
                    className="flex items-center space-x-1 text-vcb-mid-grey hover:text-[#4169E1] transition-colors"
                    title={speakingIndex === index ? 'Stop speaking' : 'Play audio (DeepInfra TTS)'}
                  >
                    {speakingIndex === index ? (
                      <span className="material-icons text-base md:text-xl animate-pulse">pause_circle</span>
                    ) : (
                      <span className="material-icons text-base md:text-xl">play_circle</span>
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
                <div className="relative border border-vcb-light-grey p-2 bg-vcb-white">
                  <img
                    src={message.imageUrl}
                    alt={message.imagePrompt || 'Generated image'}
                    className="w-full h-auto rounded"
                    loading="lazy"
                  />
                  {/* GOGGA Watermark - Lower Right */}
                  <div className="absolute bottom-4 right-4 bg-vcb-black bg-opacity-90 px-4 py-2 rounded-lg flex items-center space-x-2 shadow-lg">
                    <span className="material-icons text-white text-2xl">image</span>
                    <span className="text-white text-sm font-bold tracking-wider">GOGGA</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  {message.imagePrompt && (
                    <div className="text-xs text-vcb-mid-grey italic flex-1">
                      Prompt: {message.imagePrompt}
                    </div>
                  )}
                  {/* Download Button */}
                  <button
                    onClick={() => onDownloadImage(message.imageUrl!, message.imagePrompt || 'image')}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-[#4169E1] text-white rounded hover:bg-[#315AC1] transition-colors text-xs font-medium ml-3 flex-shrink-0"
                    title="Download Image"
                  >
                    <span className="material-icons text-sm">download</span>
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Collapsible Thinking Block (Qwen Thinking Model) */}
                {thinking && (
                  <div className="border border-vcb-light-grey bg-gray-50 rounded">
                    <button
                      onClick={() => setShowThinking(!showThinking)}
                      className="w-full px-3 py-2 text-left text-sm font-medium text-vcb-mid-grey hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>🧠 Internal Reasoning (Thinking Block)</span>
                      <span className="text-xs">{showThinking ? '▼' : '▶'}</span>
                    </button>
                    {showThinking && (
                      <div className="px-3 py-2 text-xs text-gray-700 font-mono whitespace-pre-wrap border-t border-vcb-light-grey max-h-96 overflow-y-auto">
                        {thinking}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Main Answer Content */}
                <div className="text-sm md:text-base text-vcb-black break-words leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={markdownComponents}
                  >
                    {displayContent}
                  </ReactMarkdown>
                </div>
                
                {/* Action Buttons at Bottom (for assistant messages only) */}
                {message.role === 'assistant' && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-vcb-light-grey">
                    <button
                      onClick={() => onCopy(displayContent, index)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-vcb-mid-grey hover:text-vcb-black hover:bg-gray-100 rounded transition-colors"
                      title="Copy response"
                    >
                      {copiedIndex === index ? (
                        <>
                          <span className="material-icons text-sm">check</span>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <span className="material-icons text-sm">content_copy</span>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => onRetry(index)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-vcb-mid-grey hover:text-vcb-black hover:bg-gray-100 rounded transition-colors"
                      title="Retry this response"
                    >
                      <span className="material-icons text-sm">refresh</span>
                      <span>Retry</span>
                    </button>
                  </div>
                )}
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

  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female'); // Default to female
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [userTier, setUserTier] = useState<TierType>('free');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [forceThinkingMode, setForceThinkingMode] = useState(false);
  const [useCePO, setUseCePO] = useState(false);
  const [cepoProgress, setCepoProgress] = useState<string>('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [sessionTime, setSessionTime] = useState(0); // Session time in seconds
  const sessionStartRef = useRef<number>(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceModeEnabledRef = useRef<boolean>(false); // Track voice mode state for callbacks
  const isSpeakingRef = useRef<boolean>(false); // Track if bot is currently speaking
  const isProcessingMessageRef = useRef<boolean>(false); // Track if we're processing a message
  const hasVoiceTranscriptionRef = useRef<boolean>(false); // Track if current input is from voice
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessagesLengthRef = useRef(0);
  const usageTrackerRef = useRef<UsageTracker>(new UsageTracker());
  const conversationManagerRef = useRef<ConversationManager>(new ConversationManager());
  // Removed Piper client refs - now using streaming backend
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
    li: ({children, ...props}: any) => <li className="leading-relaxed" {...props}>{processIcons(children)}</li>,
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
    
    // Load voice gender preference from localStorage
    const savedGender = localStorage.getItem('voiceGender') as 'male' | 'female' | null;
    if (savedGender) {
      setVoiceGender(savedGender);
    }

    // Show welcome toast
    setShowToast(true);
    const timer = setTimeout(() => {
      // Only auto-hide if voice mode is not enabled
      if (!voiceModeEnabled) {
        setShowToast(false);
      }
    }, 4000); // Hide after 4 seconds unless voice mode is active

    return () => clearTimeout(timer);
  }, [voiceModeEnabled]);

  // Keep toast visible while voice mode is active
  useEffect(() => {
    if (voiceModeEnabled) {
      setShowToast(true);
    }
  }, [voiceModeEnabled, isListening]);




  
  const handleSpeak = useCallback(async (text: string, index: number) => {
    // Stop any ongoing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      if (speakingIndex === index) {
        setSpeakingIndex(null);
        setCurrentAudio(null);
        isSpeakingRef.current = false;
        return;
      }
    }

    // Prevent multiple simultaneous requests
    if (isSpeakingRef.current || speakingIndex !== null) {
      console.log('🔄 TTS already in progress, blocking request');
      return;
    }

    const perfStart = performance.now();
    const truncatedText = text.substring(0, 300);
    
    // Detect language for appropriate voice
    const languageDetection = detectSALanguage(truncatedText);
    const voiceMap = {
      'af': 'twi',        // Afrikaans -> Twi (closest available)
      'zu': 'chichewa',   // Zulu -> Chichewa
      'xh': 'makhuwa',    // Xhosa -> Makhuwa
      'en': voiceGender === 'female' ? 'twi' : 'chichewa'
    };
    const selectedVoice = voiceMap[languageDetection.code as keyof typeof voiceMap] || 'twi';
    
    console.log(`🎤 Piper Streaming TTS: ${truncatedText.length} chars, Voice: ${selectedVoice}`);

    try {
      setSpeakingIndex(index);
      isSpeakingRef.current = true;

      // Stop transcription when bot starts speaking
      if (voiceModeEnabledRef.current && recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop();
          setIsListening(false);
        } catch (err) {
          console.error('Failed to stop recognition:', err);
        }
      }

      // Use Piper streaming backend
      console.log('🔗 Fetching from Piper server...');
      const response = await fetch('http://localhost:5000/tts-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: truncatedText,
          voice: selectedVoice
        })
      });

      console.log('📡 Piper response:', response.status, response.headers.get('content-type'));
      
      if (!response.ok) {
        throw new Error(`Piper server error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      console.log('🎵 Audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
      
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('🔊 Audio URL created:', audioUrl);
      
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.volume = 0.9;
      
      setCurrentAudio(audio);
      console.log('🎤 Audio element created, attempting playback...');

      audio.onloadstart = () => console.log('📥 Audio loading started');
      audio.oncanplay = () => console.log('✅ Audio can play');
      audio.onplay = () => console.log('▶️ Audio started playing');
      
      audio.onended = () => {
        console.log('⏹️ Audio playback ended');
        setSpeakingIndex(null);
        isSpeakingRef.current = false;
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);

        // Restart transcription
        if (voiceModeEnabledRef.current && recognitionRef.current && !isListening) {
          setTimeout(() => {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch (err) {
              console.error('Failed to restart recognition:', err);
            }
          }, 300);
        }
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e, audio.error);
        setSpeakingIndex(null);
        isSpeakingRef.current = false;
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      console.log('🎧 Calling audio.play()...');
      await audio.play();
      console.log('✅ Audio.play() completed successfully');
      
      const totalTime = performance.now() - perfStart;
      console.log(`⚡ Piper Streaming: ${totalTime.toFixed(1)}ms (${selectedVoice})`);
      
    } catch (error) {
      console.error('❌ Piper TTS error:', error);
      setSpeakingIndex(null);
      isSpeakingRef.current = false;
      
      // Restart recognition on error
      if (voiceModeEnabledRef.current && recognitionRef.current && !isListening) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch (err) {
            console.error('Failed to restart recognition:', err);
          }
        }, 300);
      }
    }
  }, [currentAudio, speakingIndex, voiceGender, voiceModeEnabled, isListening]);

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

  // Download image handler to avoid navigation
  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
      // Fetch the image as a blob to avoid CORS issues
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `gogga-${prompt.slice(0, 30)}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
    }
  };

  // Auto-play TTS when new assistant message arrives in voice mode
  // DISABLED: Prevents overlapping TTS requests and reduces delay
  // User can manually click speaker icon to hear responses
  /* useEffect(() => {
    if (voiceModeEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only speak if it's an assistant message and not already speaking
      if (lastMessage.role === 'assistant' && !isSpeakingRef.current && lastMessage.type !== 'image') {
        const messageIndex = messages.length - 1;
        // Small delay to ensure state is updated
        setTimeout(() => {
          handleSpeak(lastMessage.content, messageIndex);
        }, 500);
      }
    }
  }, [messages, voiceModeEnabled, handleSpeak]); */

  // Auto-focus on chat input on mount and after messages
  useEffect(() => {
    // Focus on initial load
    inputRef.current?.focus();
  }, []);

  // Re-focus after messages are sent (after loading completes)
  useEffect(() => {
    if (!isLoading && !voiceModeEnabled) {
      inputRef.current?.focus();
    }
  }, [isLoading, voiceModeEnabled]);

  // Re-focus when modals close
  useEffect(() => {
    if (!showChatHistory && !showUsage) {
      // Small delay to ensure modal close animation completes
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [showChatHistory, showUsage]);



  // Fix mobile viewport jumping when keyboard opens
  useEffect(() => {
    if (!isMobile) return;

    const setViewportHeight = () => {
      // Use visual viewport height instead of window.innerHeight
      const vh = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    };

    // Set initial height
    setViewportHeight();

    // Update on resize and scroll
    window.visualViewport?.addEventListener('resize', setViewportHeight);
    window.visualViewport?.addEventListener('scroll', setViewportHeight);
    window.addEventListener('resize', setViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener('resize', setViewportHeight);
      window.visualViewport?.removeEventListener('scroll', setViewportHeight);
      window.removeEventListener('resize', setViewportHeight);
    };
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
    recognition.lang = 'en-ZA'; // Default to South African English
    
    // Support multiple SA languages for speech recognition
    const supportedSpeechLangs = {
      'af': 'af-ZA',    // Afrikaans
      'en': 'en-ZA',    // English (SA)
      'zu': 'zu-ZA',    // Zulu
      'xh': 'xh-ZA',    // Xhosa
      // Others fall back to en-ZA
    };

    recognition.onstart = () => {
      // console.log('Speech recognition started');
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      // Get all results from this recognition session
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Combine final and interim transcripts
      const fullTranscript = (finalTranscript + interimTranscript).trim();
      
      // Update the input field with the transcript
      if (fullTranscript) {
        setInput(fullTranscript);
        hasVoiceTranscriptionRef.current = true; // Mark that we have voice transcription
        
        // Auto-detect language and switch recognition if needed
        const detected = detectSALanguage(fullTranscript);
        if (detected.confidence > 80 && detected.code !== 'en') {
          const newLang = supportedSpeechLangs[detected.code as keyof typeof supportedSpeechLangs];
          if (newLang && recognition.lang !== newLang) {
            console.log(`🎤 Switching speech recognition to ${detected.language} (${newLang})`);
            recognition.lang = newLang;
          }
        }
      }

      // Reset silence timer on speech
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Auto-submit after 2 seconds of silence
      if (finalTranscript.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          const currentInput = inputRef.current?.value.trim() || '';
          if (currentInput) {
            // Auto-submit the transcribed message
            const form = document.querySelector('form');
            if (form) {
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
          }
        }, 2000);
      }
    };

    recognition.onerror = (event: any) => {
      // console.error('Speech recognition error:', event.error);
      setIsListening(false);

      if (event.error === 'not-allowed') {
        alert('Microphone permission denied. Please allow microphone access and try again.');
        setVoiceModeEnabled(false);
      } else if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // Try to restart ONLY if voice mode is enabled AND bot is NOT speaking
        setTimeout(() => {
          try {
            if (recognitionRef.current && voiceModeEnabledRef.current && !isSpeakingRef.current) {
              recognition.start();
            }
          } catch (err) {
            // console.error('Failed to restart after error:', err);
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      // console.log('Speech recognition ended');
      setIsListening(false);

      // Don't auto-restart if we're processing a message (waiting for AI response)
      // User must manually press mic button again for next message
      setTimeout(() => {
        try {
          if (recognitionRef.current && voiceModeEnabledRef.current && 
              !isSpeakingRef.current && !isProcessingMessageRef.current) {
            recognition.start();
            // console.log('Restarting recognition...');
          }
        } catch (err) {
          // console.error('Failed to restart recognition:', err);
        }
      }, 100);
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
  }, []); // Only run once on mount - no dependency on voiceModeEnabled

  // Auto-play disabled - bot only responds in text when voice mode is on
  // User can manually click speaker icon if they want TTS
  useEffect(() => {
    lastMessagesLengthRef.current = messages.length;
  }, [messages]);

  const toggleVoiceMode = async () => {
    const newVoiceMode = !voiceModeEnabled;

    if (newVoiceMode) {
      // Request microphone permission first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed to request permission
        stream.getTracks().forEach(track => track.stop());
        
        setVoiceModeEnabled(true);
        voiceModeEnabledRef.current = true; // Update ref for callbacks

        // Start listening
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.error('Failed to start recognition:', err);
          }
        }
      } catch (err) {
        console.error('Microphone permission denied:', err);
        alert('Microphone permission is required for voice mode. Please allow microphone access in your browser settings and try again.');
        setVoiceModeEnabled(false);
        voiceModeEnabledRef.current = false;
      }
    } else {
      setVoiceModeEnabled(false);
      voiceModeEnabledRef.current = false; // Update ref for callbacks
      isSpeakingRef.current = false; // Reset speaking state
      isProcessingMessageRef.current = false; // Reset processing state
      hasVoiceTranscriptionRef.current = false; // Reset voice transcription flag
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

  // Toggle voice gender
  const toggleVoiceGender = () => {
    const newGender = voiceGender === 'female' ? 'male' : 'female';
    setVoiceGender(newGender);
    
    // Save preference to localStorage
    localStorage.setItem('voiceGender', newGender);
    
    console.log(`🎤 Voice gender switched to: ${newGender}`);
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

  // Handle retry - regenerate response for a specific message
  const handleRetry = (messageIndex: number) => {
    if (isLoading || messageIndex === 0) return; // Can't retry first message or while loading
    
    // Find the previous user message (the one before this assistant response)
    const previousUserMessage = messages[messageIndex - 1];
    if (!previousUserMessage || previousUserMessage.role !== 'user') return;
    
    // Remove the current assistant response and regenerate
    const messagesUpToRetry = messages.slice(0, messageIndex);
    setMessages(messagesUpToRetry);
    setInput('');
    setIsLoading(true);
    
    // Regenerate the response by calling handleSubmit logic directly
    const regenerateResponse = async () => {
      const userMessage = previousUserMessage;

      // Check if this is an image generation request
      if (isImageGenerationRequest(userMessage.content)) {
        try {
          // Image generation logic would go here, but simplified for now
          setIsLoading(false);
        } catch (error) {
          console.error('Error generating image:', error);
          setIsLoading(false);
        }
        return;
      }

      // Regular chat completion (copy from handleSubmit)
      try {
        const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
        if (!apiKey) {
          throw new Error('API key not configured');
        }

        const client = new Cerebras({
          apiKey: apiKey,
          maxRetries: 0,
        });

        // Check if query is trivial (skip thinking mode even if auto-detected as complex)
        const wordCount = userMessage.content.split(/\s+/).length;
        const isTrivial = wordCount <= 2;
        const greetingPatterns = /^(hi|hello|hey|howzit|hola|thanks|thank you|ok|okay|yes|no|sure|great)$/i;
        const isTrivialQuery = isTrivial || greetingPatterns.test(userMessage.content.trim());

        const useStrategicMode = !isTrivialQuery && requiresStrategicMode(userMessage.content);
        const selectedModel = useStrategicMode
          ? 'qwen-3-235b-a22b-thinking-2507'
          : 'llama-3.3-70b';

        const strategicPrompt = `ROLE: Strategic Problem Solver with Deep Reasoning (Multi-Domain Expert)
You excel at complex problem-solving across all domains: Legal, Technical, Medical, Financial, Scientific, Engineering, Business Strategy, etc.

**DOMAIN DETECTION**: Auto-detect the problem domain from user query and apply domain-specific expertise:

LEGAL DOMAIN (South African Law):
Jurisdiction: SA law (CCMA, Labour Court, Magistrates, High Court, SCA, ConCourt)
Mirror user language. Default to maximum favorable outcome for client.

CORE HIERARCHY (Auto-Check Every Query):
1. Constitution (s.2 supremacy, s.7-39 BOR, s.35 accused rights)
2. Domain-Specific Primary Statute:
   - Labour: LRA 66/1995, BCEA 75/1997, EEA 55/1998
   - Criminal: Criminal Procedure Act 51/1977, NPA Act 32/1998, bail principles s.60 CPA
   - General: Common law (delict, contract, property), relevant statute (Consumer Protection Act 68/2008, etc.)
3. ConCourt precedents (binding, cite CCT case number)
4. Court hierarchy precedents by recency (2025>2024>2023)
5. Ubuntu principle (restorative, but never sacrifices client advantage or justice)

FRAUD DOCUMENT AUDIT LAYER (Critical Override):
• EVERY document flagged for fraud indicators BEFORE legal analysis proceeds
• Fraud markers: Forgery, backdating, alterations, signature inconsistencies, metadata tampering, chain-of-custody breaks
• If fraud suspected: HALT advice - FLAG "WARNING FRAUD ALERT: [document] requires forensic verification"
• Do not proceed with legal argument on fraudulent doc until verified authentic
• Report fraud disclosure obligations (s.34 POCA Act 121/1998, professional duties)

LETHAL TACTICAL OVERLAY:
• Procedure weaponization: Time-bars (CCMA 30-day, CPA 120-day trial), forum shopping, burden-shifting
• Evidence strategy: Witness credibility destruction, documentary gaps, adverse inference, forensic leverage
• Constitutional amplification: Frame as fundamental rights breach (s.35 BOR, ubuntu interpretation)
• Settlement leverage: Exposure calculation, reputational risk, cost escalation, fraud discovery advantage

TECHNICAL/ENGINEERING DOMAIN:
• Architecture analysis: System design patterns, scalability, trade-offs
• Debugging: Root cause analysis, edge cases, race conditions
• Optimization: Algorithm complexity, performance bottlenecks, resource efficiency
• Best practices: Code quality, maintainability, security vulnerabilities
• Multi-approach: Compare 2-3 solution architectures with pros/cons

FINANCIAL/BUSINESS DOMAIN:
• Risk assessment: Market analysis, volatility, exposure
• Investment strategy: Portfolio optimization, diversification, tax implications
• Business analysis: ROI calculation, cash flow, break-even, competitive advantage
• Compliance: Regulatory requirements, reporting obligations

MEDICAL/HEALTH DOMAIN:
• Differential diagnosis: Consider multiple possibilities
• Evidence-based: Cite medical literature, guidelines, contraindications
• Risk factors: Patient safety, adverse effects, drug interactions
• DISCLAIMER: Not medical advice - recommend consulting healthcare professional

SCIENTIFIC/RESEARCH DOMAIN:
• Hypothesis evaluation: Evidence strength, confounding factors
• Methodology: Experimental design, statistical validity
• Literature review: Cite peer-reviewed sources, consensus vs. debate
• Reproducibility: Control variables, sample size, limitations

UNIVERSAL REASONING PROTOCOL (ALL DOMAINS):
• FUZZY SCORE (0-1): Rate all ambiguous facts/assumptions. Output score with reasoning.
• AUDIT TRACE: Cite sources/references for every claim. Never cite without verification.
• HALLUCINATION BLOCK: If uncertain, state "Requires verification: [topic]" and skip assumption.
• ADVERSARY MODEL: After each recommendation, simulate opposing viewpoint plus your rebuttal.
• Risk assessment: If counterargument over 0.6 likelihood, flag as serious risk.
• MULTIPLE APPROACHES: Generate 2-3 alternative solutions, compare trade-offs

OUTPUT FORMAT (ADAPT TO DOMAIN):
[QUERY ANALYSIS] Domain: [Legal/Technical/Financial/Medical/etc] | Complexity: [Low/Medium/High] | Confidence: X%
[KEY FINDINGS] Main insights | Critical factors | Red flags (if any)
[DEEP ANALYSIS] Step-by-step reasoning | Evidence | Trade-offs
[STRATEGIC RECOMMENDATIONS] Primary approach | Alternative approaches | Risk mitigation
[NEXT STEPS] Clear action items | Timeline (if applicable)

FORMATTING (CRITICAL - STRICT COMPLIANCE):
• NO emojis anywhere (use Material Icons instead)
• NO horizontal rules: ---, ___, *** (ABSOLUTELY FORBIDDEN - breaks formatting)
• Material Icons: Use sparingly ONLY in headings/bullet points: [gavel] [verified] [warning] [lightbulb]
• NEVER put icons inside table cells (breaks markdown rendering)
• Tables: Proper markdown with blank line before table, NO icons in cells, clean pipe separation
• Use blank lines for spacing between sections (NOT horizontal rules)
• Cite all sources with proper attribution

LEGAL VERIFIED ANCHORS: S v Makwanyane [1995] 3 SA 391 (CC), Harksen v Lane [1998] 1 SA 300 (CC), Municipal Manager OR Tambo v Ndabeni [2022] ZACC 3, LRA s.187 automatically unfair, CPA s.60 bail, PAJA s.6(2)(e) rationality, Prescription Act s.10/s.20.

        ${CEPO_IDENTITY_PROMPT}`;

        const goggaPrompt = GOGGA_BASE_PROMPT;

        const systemPromptContent = useStrategicMode ? strategicPrompt : goggaPrompt;        const systemMessage = {
          role: 'system' as const,
          content: systemPromptContent
        };

        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: [
            systemMessage,
            ...messagesUpToRetry.map((msg) => ({
              role: msg.role,
              content: msg.content,
            }))
          ],
          temperature: 0.0,
          top_p: 0.85,
          max_tokens: 4096,
          stream: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawContent = ((response.choices as any)[0]?.message?.content as string) || 'No response received';
        
        const modelIndicator = useStrategicMode
          ? '\n\n*[VCB-AI Strategic Legal Analysis]*'
          : '';
        
        const processedContent = fixMarkdownTables(enforceFormatting(normalizeIcons(rawContent + modelIndicator)));

        const assistantMessage: Message = {
          role: 'assistant',
          content: processedContent,
          timestamp: Date.now(),
          model: useStrategicMode ? 'qwen' : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
      } catch (error) {
        console.error('Error regenerating response:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: 'Sorry, there was an error regenerating the response. Please try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      }
    };
    
    regenerateResponse();
  };

  // CePO: Cerebras Planning & Optimization - Advanced Reasoning Pipeline
  const runCePO = async (query: string, client: Cerebras, conversationHistory: Message[]): Promise<string> => {
    try {
      // Stage 1: Planning - Generate step-by-step plan
      setCepoProgress('Planning: Creating strategy...');
      const planPrompt = `You are an expert problem solver. Break down this problem into clear, actionable steps.

Problem: ${query}

Create a detailed step-by-step plan to solve this problem. Be specific and thorough.`;

      const planResponse = await client.chat.completions.create({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are a strategic planner. Create detailed, actionable plans.' },
          { role: 'user', content: planPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: false,
      });

      const plan = (planResponse.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 2: Execution - Generate solution (N=1 to avoid rate limits)
      setCepoProgress('Executing: Generating solution...');
      
      const execPrompt = `Problem: ${query}

Plan:
${plan}

Follow the plan above to solve this problem. Show your work step by step.`;

      const execution = await client.chat.completions.create({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are a problem solver. Follow plans carefully and show your reasoning.' },
          ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: execPrompt }
        ],
        temperature: 0.8,
        max_tokens: 3072,
        stream: false,
      });

      const solution = (execution.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 3: Analysis - Verify solution quality
      setCepoProgress('Analyzing: Verifying solution...');
      const analysisPrompt = `Review this solution and identify:
1. Is the reasoning sound and logical?
2. Are there any errors or gaps?
3. Can this be improved?

Solution:
${solution}

Provide a detailed analysis focusing on correctness and areas for improvement.`;

      const analysisResponse = await client.chat.completions.create({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are an analytical expert. Review solutions objectively and identify improvements.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3, // Lower temperature for consistent analysis
        max_tokens: 2048,
        stream: false,
      });

      const analysis = (analysisResponse.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 4: Refinement with feedback
      setCepoProgress('Refining: Improving solution...');
      const refinementPrompt = `Based on this analysis, provide the final refined solution:

Original Solution:
${solution}

Analysis & Feedback:
${analysis}

Provide the improved final answer addressing any issues identified.`;

      const refinementResponse = await client.chat.completions.create({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are a solution refiner. Take feedback and improve solutions while maintaining clarity.' },
          { role: 'user', content: refinementPrompt }
        ],
        temperature: 0.5,
        max_tokens: 3072,
        stream: false,
      });

      const finalSolution = (refinementResponse.choices as any)[0]?.message?.content || '';

      // Format final response with CePO metadata
      const cepoResponse = `${finalSolution}

---

**[CePO Reasoning Process]**

**Plan:** ${plan.substring(0, 200)}...

**Analysis:** ${analysis.substring(0, 300)}...

*CePO used 4 sequential stages with rate-limit protection on Cerebras infrastructure*`;

      setCepoProgress('');
      return cepoResponse;

    } catch (error) {
      console.error('CePO pipeline error:', error);
      setCepoProgress('');
      throw error;
    }
  };

  // FLUX-1.1-pro Image Generation via DeepInfra
  const generateFluxImage = async (prompt: string): Promise<string> => {
    const deepinfraApiKey = import.meta.env.VITE_DEEPINFRA_API_KEY;
    if (!deepinfraApiKey) {
      throw new Error('DeepInfra API key not configured. Please add VITE_DEEPINFRA_API_KEY to your .env file.');
    }

    try {
      // Direct API call instead of SDK to avoid header issues
      const response = await fetch('https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1.1-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepinfraApiKey}`,
        },
        body: JSON.stringify({
          prompt: prompt,
          width: 1024,
          height: 1024,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`DeepInfra API error: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      
      // DeepInfra returns different formats: images[], url, image_url, or output[]
      if (data.images && data.images.length > 0) {
        return data.images[0];
      } else if (data.image_url) {
        return data.image_url;
      } else if (data.url) {
        return data.url;
      } else if (data.output && Array.isArray(data.output) && data.output.length > 0) {
        return data.output[0];
      } else {
        console.error('Unexpected response format:', data);
        throw new Error('No image URL returned from DeepInfra');
      }
    } catch (error) {
      console.error('FLUX image generation error:', error);
      throw error;
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      alert('Please enter an image description');
      return;
    }

    setIsGeneratingImage(true);
    setShowImagePrompt(false);

    const userMessage: Message = {
      role: 'user',
      content: `Generate image: "${imagePrompt.trim()}"`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Add progress message
    const progressMessage: Message = {
      role: 'assistant',
      content: `🎨 Generating image with FLUX-1.1-pro...\n\nPrompt: "${imagePrompt.trim()}"\n\nThis may take 10-30 seconds. Please wait...`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, progressMessage]);

    const promptToGenerate = imagePrompt.trim();
    setImagePrompt('');

    try {
      const imageUrl = await generateFluxImage(promptToGenerate);

      // Remove progress message
      setMessages((prev) => prev.filter(msg => msg !== progressMessage));

      const imageMessage: Message = {
        role: 'assistant',
        content: `Generated image: "${promptToGenerate}"`,
        timestamp: Date.now(),
        type: 'image',
        imageUrl: imageUrl,
        imagePrompt: promptToGenerate,
      };

      setMessages((prev) => [...prev, imageMessage]);
    } catch (error: any) {
      // Remove progress message
      setMessages((prev) => prev.filter(msg => msg !== progressMessage));

      const errorMsg: Message = {
        role: 'assistant',
        content: `❌ Failed to generate image: ${error.message || 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Detect SA language
    const languageDetection = detectSALanguage(input.trim());
    console.log('🌍 Language detected:', languageDetection);

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
      isVoiceTranscription: hasVoiceTranscriptionRef.current, // Mark if sent via voice transcription
      language: languageDetection.code,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    isProcessingMessageRef.current = true; // Mark that we're processing a message
    hasVoiceTranscriptionRef.current = false; // Reset voice transcription flag

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

        // Two-Tier Smart Router: Llama (default) → Qwen Thinking (VCB-AI Legal for complex)
        // Check if query is trivial (skip thinking mode even if forced)
        const wordCount = userMessage.content.split(/\s+/).length;
        const isTrivial = wordCount <= 2;
        const greetingPatterns = /^(hi|hello|hey|howzit|hola|thanks|thank you|ok|okay|yes|no|sure|great)$/i;
        const isTrivialQuery = isTrivial || greetingPatterns.test(userMessage.content.trim());

        const useStrategicMode = !isTrivialQuery && (forceThinkingMode || requiresStrategicMode(userMessage.content));
        const selectedModel = useStrategicMode
          ? 'qwen-3-235b-a22b-thinking-2507'  // VCB-AI Strategic Legal Analysis (THINKING model)
          : 'llama-3.3-70b';                    // Default GOGGA

        // Check if CePO should be used (takes priority over other modes for complex reasoning)
        if (useCePO && !useStrategicMode) {
          try {
            const cepoResult = await runCePO(userMessage.content, client, messages);
            
            const assistantMessage: Message = {
              role: 'assistant',
              content: cepoResult,
              timestamp: Date.now(),
              model: 'cepo',
            };

            setMessages((prev) => [...prev, assistantMessage]);
            usageTrackerRef.current.trackMessage(userMessage.content, cepoResult);
            break; // Exit retry loop
          } catch (cepoError) {
            console.error('CePO failed, falling back to standard mode:', cepoError);
            // Continue with standard processing
          }
        }

        // VCB-AI Strategic System Prompt: Strategic SA Legal Framework (Labour/Criminal/General)
        const strategicPrompt = `ROLE: South African Strategic Legal Advisor (Labour/Criminal/General Law). 
Jurisdiction: SA law (CCMA, Labour Court, Magistrates, High Court, SCA, ConCourt). 
Mirror user language. Default to maximum favorable outcome for client.

CORE HIERARCHY (Auto-Check Every Query):
1. Constitution (s.2 supremacy, s.7-39 BOR, s.35 accused rights)
2. Domain-Specific Primary Statute:
   └─ Labour: LRA 66/1995, BCEA 75/1997, EEA 55/1998
   └─ Criminal: Criminal Procedure Act 51/1977, NPA Act 32/1998, bail principles s.60 CPA
   └─ General: Common law (delict, contract, property), relevant statute (Consumer Protection Act 68/2008, etc.)
3. ConCourt precedents (binding, cite CCT case number)
4. Court hierarchy precedents by recency (2025>2024>2023)
5. Ubuntu principle (restorative, but never sacrifices client advantage or justice)

FRAUD DOCUMENT AUDIT LAYER (Critical Override):
• EVERY document flagged for fraud indicators BEFORE legal analysis proceeds
• Fraud markers: Forgery, backdating, alterations, signature inconsistencies, metadata tampering, chain-of-custody breaks
• If fraud suspected: HALT advice → FLAG "⚠ FRAUD ALERT: [document] requires forensic verification"
• Do not proceed with legal argument on fraudulent doc until verified authentic
• Report fraud disclosure obligations (s.34 POCA Act 121/1998, professional duties)

REASONING PROTOCOL:
• FUZZY SCORE (0-1): Rate all ambiguous facts/rules. Output score with reasoning.
• AUDIT TRACE: Cite statute section + case name/year/court for every claim. Never cite without anchor.
• HALLUCINATION BLOCK: If precedent unclear, state "Requires verification: [case name]" & skip assumption.
• ADVERSARY MODEL: After each recommendation, simulate opponent's best counterargument + your rebuttal.
• Counter-success rate: If opponent's counter >0.6 likelihood, flag as serious risk.

LETHAL TACTICAL OVERLAY:
• Procedure weaponization: Time-bars (CCMA 30-day, CPA 120-day trial), forum shopping, burden-shifting
• Evidence strategy: Witness credibility destruction, documentary gaps, adverse inference, forensic leverage
• Constitutional amplification: Frame as fundamental rights breach (s.35 BOR, ubuntu interpretation)
• Settlement leverage: Exposure calculation, reputational risk, cost escalation, fraud discovery advantage

OUTPUT FORMAT (REQUIRED STRUCTURE):
[QUERY ANALYSIS] Domain: [Labour/Criminal/General] | Fuzzy Score: X/1.0 | Winning Probability: Y%
[FRAUD AUDIT] Red flags: [None / List] | Authenticity: [Verified / ⚠ Requires Forensic / 🚨 ALERT]
[AUTHORITY STACK] Constitutional: [s.X] | Statute: [Act section] | Precedent: [Case (Year/Court)]
[LETHAL STRATEGY] Primary tactic + Counter-argument + Rebuttal | Alternative tactics if primary risky
[REMEDY & SETTLEMENT] Outcome range | Settlement leverage point
[RISK FLAGGING] 🚩 Critical risks → Mitigation → RECOMMEND: [Next action]

WHEN PRESENTING MULTIPLE ISSUES/FINDINGS: ALWAYS USE MARKDOWN TABLE (NOT NUMBERED LISTS)
Example structure for irregularities/risks/findings:

| Issue | Description | Risk Level |
|-------|-------------|------------|
| Date Discrepancy | Settlement signed 2008, referenced as 2009 | High |
| Pension Paid | R464k received in 2009, contradicts split claim | Critical |

FORMATTING (CRITICAL - STRICT COMPLIANCE REQUIRED):
• NO emojis anywhere (use Material Icons instead)
• NO horizontal rules: ---, ___, *** (ABSOLUTELY FORBIDDEN - breaks formatting)
• Material Icons: Use sparingly ONLY in headings/bullet points: [gavel] [verified] [warning]
• NEVER EVER put icons inside table cells (breaks markdown rendering)
• Tables: Proper markdown with blank line before table, NO icons in cells, clean pipe separation
• Use blank lines for spacing between sections (NOT horizontal rules)
• Cite all sources with proper attribution

TABLE EXAMPLE (CORRECT):
| Issue | Description | Legal Risk |
|-------|-------------|------------|
| Date Discrepancy | Settlement signed 28 Aug 2008 | Invalid incorporation |

TABLE EXAMPLE (WRONG - DO NOT DO THIS):
| Issue | Description | Legal Risk |
|-------|-------------|------------|
| [gavel] Date Discrepancy | Settlement signed 28 Aug 2008 | Invalid incorporation |

VERIFIED ANCHORS: S v Makwanyane [1995] 3 SA 391 (CC), Harksen v Lane [1998] 1 SA 300 (CC), Municipal Manager OR Tambo v Ndabeni [2022] ZACC 3, LRA s.187 automatically unfair, CPA s.60 bail, PAJA s.6(2)(e) rationality, Prescription Act s.10/s.20.

        ${QWEN_IDENTITY_PROMPT}`;

        // GOGGA System Prompt: Moderate legal + casual queries
        const goggaPrompt = GOGGA_BASE_PROMPT;

        // Add language context to prompts
        const languageContext = languageDetection.confidence > 70 && languageDetection.code !== 'en' 
          ? `\n\nUSER LANGUAGE DETECTED: ${languageDetection.language} (${languageDetection.code}) - Confidence: ${languageDetection.confidence.toFixed(1)}%\nRespond naturally in this language when appropriate. Use ${languageDetection.greeting} style greetings.`
          : '';

        // Select appropriate prompt: VCB-AI Strategic for legal/complex, GOGGA for everything else
        const systemPromptContent = (useStrategicMode ? strategicPrompt : goggaPrompt) + languageContext;

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
        const modelIndicator = useStrategicMode
          ? '\n\n*[VCB-AI Strategic Legal Analysis]*' // Show when using full legal framework
          : ''; // Clean UI for casual queries
        
        const processedContent = fixMarkdownTables(enforceFormatting(normalizeIcons(rawContent + modelIndicator)));

        const assistantMessage: Message = {
          role: 'assistant',
          content: processedContent,
          timestamp: Date.now(),
          model: useStrategicMode ? 'qwen' : undefined,
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
    isProcessingMessageRef.current = false; // Done processing, can restart recognition if needed
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
      <header className="bg-vcb-black border-b border-vcb-mid-grey px-3 py-1 md:px-8 md:py-4">
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
              <h1 className="text-sm md:text-2xl font-extrabold text-vcb-white tracking-wider">
                GOGGA (BETA)
              </h1>
              <p className="text-vcb-white text-[8px] md:text-xs mt-0 md:mt-0.5 font-medium uppercase tracking-wide">
                Powered by VCB-AI
              </p>
              <p className="text-vcb-white text-[7px] md:text-xs mt-0.5 font-medium uppercase tracking-wide italic flex items-center gap-1">
                <span className="material-icons text-[10px] md:text-sm">auto_awesome</span>
                Now with Cognitive Execution Pipeline Optimization <span className="text-[#4169E1] font-bold">[CePO]</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col space-y-2">
            {/* Row 1: History and Timer */}
            <div className="flex items-center space-x-2">
              {/* Chat History Button */}
              <button
                type="button"
                onClick={() => setShowChatHistory(!showChatHistory)}
                className="flex items-center justify-center space-x-1 w-24 md:w-32 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors"
                title="Chat History"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                </svg>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">History</span>
              </button>

              {/* Session Timer */}
              <div className="flex items-center justify-center space-x-1 w-24 md:w-32 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white">
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
                <span className="text-[10px] md:text-xs font-mono font-medium tracking-wide">
                  {formatSessionTime(sessionTime)}
                </span>
              </div>
            </div>

            {/* Row 2: Usage, Voice Gender, and Create Image */}
            <div className="flex items-center space-x-2">
              {/* Usage Stats Button */}
              <button
                type="button"
                onClick={() => setShowUsage(!showUsage)}
                className="flex items-center justify-center space-x-1 w-24 md:w-32 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors"
                title="View Usage & Pricing"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                </svg>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">Usage</span>
              </button>

              {/* Voice Gender Toggle Button */}
              <button
                type="button"
                onClick={toggleVoiceGender}
                className="flex items-center justify-center space-x-1 w-24 md:w-32 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-accent bg-vcb-black text-vcb-accent hover:bg-vcb-accent hover:text-vcb-black transition-colors"
                title={`Switch to ${voiceGender === 'female' ? 'Male' : 'Female'} Voice`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  {voiceGender === 'female' ? (
                    // Female icon
                    <path d="M17.5 9.5C17.5 6.46 15.04 4 12 4S6.5 6.46 6.5 9.5c0 2.7 1.94 4.93 4.5 5.4V17H9v2h2v2h2v-2h2v-2h-2v-2.1c2.56-.47 4.5-2.7 4.5-5.4zm-9 0C8.5 7.57 10.07 6 12 6s3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5z"/>
                  ) : (
                    // Male icon
                    <path d="M9 9c0-1.65 1.35-3 3-3s3 1.35 3 3c0 1.66-1.35 3-3 3s-3-1.34-3-3m3 8c-4.34 0-6.29 2.28-6.29 2.28L7.5 21s1.93-2.3 4.5-2.3 4.5 2.3 4.5 2.3l1.79-1.72S16.34 17 12 17zm7-11.2V2h-2v3.8h-3.8v2H17v3.8h2V7.8h3.8v-2H19z"/>
                  )}
                </svg>
                <span className="hidden md:inline text-white text-[10px] font-medium uppercase tracking-wide">
                  {voiceGender === 'female' ? '♀ Female' : '♂ Male'}
                </span>
              </button>

              {/* Create Image Button - VCB-AI FLUX Model */}
              <button
                type="button"
                onClick={() => setShowImagePrompt(!showImagePrompt)}
                className={`flex items-center justify-center space-x-1 w-24 md:w-32 px-2 py-1.5 md:px-3 md:py-2 border transition-colors ${
                  showImagePrompt 
                    ? 'bg-[#28a745] text-white border-[#28a745]' 
                    : 'bg-vcb-black text-vcb-white border-vcb-mid-grey hover:border-vcb-white'
                }`}
                title="Test VCB-AI latest image model"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="white" viewBox="0 0 24 24" style={{ transform: 'rotate(10deg)' }}>
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">Test Image</span>
              </button>
            </div>
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
                onRetry={handleRetry}
                onDownloadImage={handleDownloadImage}
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
      <div className="border-t border-vcb-light-grey bg-white px-1.5 py-1.5 md:px-8 md:py-6">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
          {voiceModeEnabled && isListening && (
            <div className="mb-1 md:mb-3 flex items-center justify-center space-x-2 text-vcb-mid-grey">
              <svg className="w-3 h-3 md:w-4 md:h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              <span className="text-[10px] md:text-sm font-medium uppercase">Listening...</span>
            </div>
          )}
          {showImagePrompt && (
            <div className="mb-2 md:mb-4 bg-gradient-to-r from-vcb-black to-vcb-dark-grey border-2 border-vcb-accent p-4 md:p-6 rounded-lg shadow-lg">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="flex items-center space-x-2">
                  <span className="material-icons text-vcb-accent text-xl md:text-2xl">image</span>
                  <h3 className="text-sm md:text-lg font-bold text-vcb-white uppercase tracking-wider">VCB-AI Image Generator</h3>
                </div>
                <button
                  onClick={() => setShowImagePrompt(false)}
                  className="text-vcb-white hover:text-vcb-accent transition-colors"
                  title="Close"
                >
                  <span className="material-icons text-xl">close</span>
                </button>
              </div>
              <p className="text-white text-xs md:text-sm mb-3 font-medium">Powered by FLUX-1.1-pro via DeepInfra</p>
              <div className="relative">
                <input
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerateImage();
                    }
                  }}
                  placeholder="Describe your image... (e.g., 'A futuristic city at sunset with flying cars')"
                  className="w-full bg-vcb-white text-vcb-black border-2 border-vcb-mid-grey focus:border-vcb-accent px-4 py-3 text-sm md:text-base rounded-lg focus:outline-none transition-colors placeholder:text-vcb-mid-grey mb-3"
                  disabled={isGeneratingImage}
                />
              </div>
              <button
                onClick={handleGenerateImage}
                disabled={!imagePrompt.trim() || isGeneratingImage}
                className="w-full bg-vcb-accent hover:bg-yellow-500 disabled:bg-vcb-mid-grey disabled:cursor-not-allowed text-vcb-black px-6 py-3 text-sm md:text-base font-bold uppercase tracking-wider transition-all duration-200 rounded-lg shadow-md hover:shadow-xl disabled:shadow-none flex items-center justify-center space-x-2"
              >
                {isGeneratingImage ? (
                  <>
                    <span className="material-icons animate-spin">autorenew</span>
                    <span>Generating Your Image...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons">auto_awesome</span>
                    <span>Generate Image</span>
                  </>
                )}
              </button>
            </div>
          )}
          {cepoProgress && (
            <div className="mb-1 md:mb-3 flex items-center justify-center space-x-2 text-vcb-accent">
              <span className="material-icons text-base md:text-xl animate-spin">
                {cepoProgress.includes('Planning') ? 'psychology' : 
                 cepoProgress.includes('Executing') ? 'bolt' : 
                 cepoProgress.includes('Analyzing') ? 'search' : 
                 cepoProgress.includes('Refining') ? 'auto_awesome' : 'autorenew'}
              </span>
              <span className="text-[10px] md:text-sm font-medium">{cepoProgress}</span>
            </div>
          )}
          <div className="flex items-center space-x-1 md:space-x-4">
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
              className="flex-1 bg-white text-vcb-black border border-vcb-light-grey px-2 py-2 md:px-6 md:py-4 text-sm md:text-base focus:outline-none focus:border-vcb-mid-grey resize-none font-normal leading-relaxed h-10 md:h-16"
              rows={1}
              disabled={isLoading}
            />
            {/* Mobile: Horizontal compact buttons */}
            <div className="flex md:hidden items-center space-x-0.5">
              <button
                type="button"
                onClick={() => setForceThinkingMode(!forceThinkingMode)}
                disabled={isLoading || useCePO}
                className={`w-9 h-10 transition-colors duration-200 border flex items-center justify-center flex-shrink-0 ${
                  forceThinkingMode
                    ? 'bg-[#DC143C] text-white border-[#DC143C]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={forceThinkingMode ? 'Thinking Mode ON (Qwen)' : 'Thinking Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-sm">psychology</span>
              </button>
              <button
                type="button"
                onClick={() => setUseCePO(!useCePO)}
                disabled={isLoading || forceThinkingMode}
                className={`w-9 h-10 transition-colors duration-200 border flex items-center justify-center flex-shrink-0 ${
                  useCePO
                    ? 'bg-[#4169E1] text-white border-[#4169E1]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={useCePO ? 'CePO Mode ON (Advanced Reasoning)' : 'CePO Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-sm">auto_awesome</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImagePrompt(!showImagePrompt)}
                disabled={isLoading || isGeneratingImage}
                className={`w-9 h-10 transition-colors duration-200 border flex items-center justify-center flex-shrink-0 ${
                  showImagePrompt
                    ? 'bg-[#28a745] text-white border-[#28a745]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Generate Image with FLUX"
              >
                <span className="material-icons text-sm">image</span>
              </button>
              <button
                type="button"
                onClick={toggleVoiceMode}
                disabled={isLoading}
                className={`w-9 h-10 transition-colors duration-200 border flex items-center justify-center flex-shrink-0 ${
                  isListening 
                    ? 'bg-red-500 text-white border-red-600 animate-pulse' 
                    : voiceModeEnabled
                    ? 'bg-vcb-black text-vcb-white border-vcb-mid-grey hover:bg-vcb-dark-grey'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isListening ? 'Listening... (Click to stop)' : voiceModeEnabled ? 'Voice Mode ON (Click to disable)' : 'Voice Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-sm">
                  {isListening ? 'mic' : 'mic_off'}
                </span>
              </button>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white w-9 h-10 font-medium transition-colors duration-200 flex items-center justify-center border border-vcb-mid-grey flex-shrink-0"
              >
                {isLoading ? (
                  <img
                    src="sovereign-thinking-spinner.svg"
                    alt="Sending..."
                    className="h-3.5 w-3.5"
                  />
                ) : (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
                  </svg>
                )}
              </button>
            </div>
            {/* Desktop: Horizontal button layout */}
            <div className="hidden md:flex md:items-center md:space-x-4">
              <button
                type="button"
                onClick={() => setForceThinkingMode(!forceThinkingMode)}
                disabled={isLoading || useCePO}
                className={`px-4 h-16 transition-colors duration-200 border flex items-center justify-center ${
                  forceThinkingMode
                    ? 'bg-[#DC143C] text-white border-[#DC143C]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={forceThinkingMode ? 'Thinking Mode ON (Qwen)' : 'Thinking Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-2xl">psychology</span>
              </button>
              <button
                type="button"
                onClick={() => setUseCePO(!useCePO)}
                disabled={isLoading || forceThinkingMode}
                className={`px-4 h-16 transition-colors duration-200 border flex items-center justify-center ${
                  useCePO
                    ? 'bg-[#4169E1] text-white border-[#4169E1]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={useCePO ? 'CePO Mode ON (Advanced Reasoning)' : 'CePO Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-2xl">auto_awesome</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImagePrompt(!showImagePrompt)}
                disabled={isLoading || isGeneratingImage}
                className={`px-4 h-16 transition-colors duration-200 border flex items-center justify-center ${
                  showImagePrompt
                    ? 'bg-[#28a745] text-white border-[#28a745]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Generate Image with FLUX"
              >
                <span className="material-icons text-2xl">image</span>
              </button>
              <button
                type="button"
                onClick={toggleVoiceMode}
                disabled={isLoading}
                className={`px-4 h-16 transition-colors duration-200 border flex items-center justify-center ${
                  isListening 
                    ? 'bg-red-500 text-white border-red-600 animate-pulse' 
                    : voiceModeEnabled
                    ? 'bg-vcb-black text-vcb-white border-vcb-mid-grey hover:bg-vcb-dark-grey'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isListening ? 'Listening... (Click to stop)' : voiceModeEnabled ? 'Voice Mode ON (Click to disable)' : 'Voice Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-2xl">
                  {isListening ? 'mic' : 'mic_off'}
                </span>
              </button>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white px-8 h-16 text-sm font-medium uppercase tracking-wider transition-colors duration-200 flex items-center space-x-3 border border-vcb-mid-grey"
              >
                {isLoading ? (
                  <>
                    <img
                      src="sovereign-thinking-spinner.svg"
                      alt="Sending..."
                      className="h-5 w-5"
                    />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                      <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
                    </svg>
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Interactive Voice Mode Toast Notification */}
        {showToast && (
          <div 
            className="fixed bottom-24 right-8 z-40 cursor-pointer transform hover:scale-105 transition-transform"
            onClick={async () => {
              if (!voiceModeEnabled) {
                // Start voice mode
                await toggleVoiceMode();
              } else {
                // Hide toast when clicked during voice mode
                setShowToast(false);
              }
            }}
            title={voiceModeEnabled ? 'Click to hide' : 'Click to start voice chat'}
          >
            <div className={`bg-gradient-to-r from-[#4169E1] to-vcb-accent px-6 py-4 rounded-lg shadow-2xl border-2 border-white flex items-center space-x-3 ${!voiceModeEnabled ? 'animate-bounce' : ''}`}>
              <span className="material-icons text-white text-3xl animate-pulse">
                {voiceModeEnabled && isListening ? 'mic' : voiceModeEnabled ? 'mic_off' : 'chat'}
              </span>
              <div className="text-white font-bold text-lg tracking-wide">
                {voiceModeEnabled && isListening ? 'Listening...' : voiceModeEnabled ? 'Voice Mode Active' : 'Chat to GOGGA!!!!'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
