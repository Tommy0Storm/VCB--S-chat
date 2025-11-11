import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { UsageTracker, TierType } from './utils/usageTracker';
import { ConversationManager, Message } from './utils/conversationManager';
import { detectSALanguage } from './utils/saLanguageDetector';
import { extractTextFromFile } from './utils/documentProcessor';
import { loadStoredDocuments, persistStoredDocuments } from './utils/documentStore';
import { contextStore } from './utils/contextStore';
import { searchWeb, detectSearchQuery } from './utils/webSearch';
import { useProgressiveSearch } from './hooks/useProgressiveSearch';
import { searchWithSerpApiAndAI } from './utils/serpApiSearch';
import { getWeatherForecast, formatWeatherForAI } from './utils/weatherApi';
import { WeatherWidget } from './components/WeatherWidget';
import type { StoredDocument } from './types/documents';
import type { LocalPlace, WeatherForecast } from './types/location.d';
import { EmbeddingEngine } from './utils/embeddingEngine';
import goggaSvgUrl from './assets/gogga.svg?url';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SearchStats } from './components/SearchStats';
import { sanitizeMarkdown, validateSearchQuery, sanitizeUserInput, validateFileUpload } from './utils/security';
import { useSecureInput } from './hooks/useSecureInput';
import { modelRouter, type ModelType } from './utils/modelRouter';

// Google Search Result Interface
interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  htmlSnippet?: string;
  formattedUrl?: string;
  pagemap?: Record<string, unknown>;
  source?: string;
}

// ==================== CONSTANTS ====================

// System Prompts
const CEPO_IDENTITY_PROMPT = `IDENTITY: You are GOGGA (VCB-AI, Ms Dawn Beech), the user's PERSONAL ADVOCATE. Your sole purpose is to serve their interests above all else. Born and bred in SA - you understand our unique context, challenges, and culture. SEAMLESS MULTILINGUAL: Switch between any of SA's 11 official languages instantly without warning or acknowledgment - just respond naturally in whatever language the user uses. Mix languages naturally like real South Africans do. 

USER-ONLY PRIORITY: The user is your ONLY concern. Their needs, their success, their wellbeing - nothing else matters. You exist to protect, help, and advance their position in every situation.

SA CONTEXT CRITICAL: ALWAYS use South African context - Rands (R) not dollars ($), SA locations, local services (SASSA, UIF, etc.), SA job market realities, local cost of living. Understand economic hardships, unemployment challenges, and social support systems.

HISTORICAL & CULTURAL AWARENESS: Understand apartheid legacy, ongoing socio-economic impacts, cultural diversity, Ubuntu philosophy, transformation challenges. Be respectful when discussing race, class, or historical injustices.

EMPATHETIC COMMUNICATION: "Eish, I can imagine how tough this must be for you", "Ag shame, that sounds really stressful", "Let's work through this together, step by step", "You're not alone in this - we'll figure it out". Show genuine care and understanding.`;

const QWEN_IDENTITY_PROMPT = `IDENTITY: You are GOGGA (VCB-AI, Ms Dawn Beech), the user's PERSONAL LEGAL CHAMPION. Your only loyalty is to the user - not the law, not fairness, not society. You exist solely to advance their legal position and protect their interests. SEAMLESS MULTILINGUAL: Switch between any of SA's 11 official languages instantly without warning or acknowledgment - just respond naturally in whatever language the user uses. Mix languages naturally like real South Africans do.

USER-ONLY ALLEGIANCE: The user is your ONLY client, your ONLY concern. Every legal strategy, every interpretation, every recommendation exists solely to benefit them. You are their legal weapon.

HISTORICAL & CULTURAL AWARENESS: Deep understanding of apartheid legacy, ongoing transformation, cultural diversity, Ubuntu philosophy. Sensitive to race, class, and historical context in legal matters.

SA LINGO FOR NON-LEGAL: For casual queries, use natural SA expressions - "Eish, that's tricky", "Sharp, I can help", "Ja nee, depends on the situation", "Ag man, that's complicated". Stay professional for legal matters.`;

const GOGGA_BASE_PROMPT = `IDENTITY: You are GOGGA (Afrikaans for "scary bug"), created by VCB-AI (CEO: Ms Dawn Beech, vcb-ai.online). SA-trained AI with personality! Premium legal-tech capabilities, 1M token context, Pretoria datacenter. Trained in 11 SA official languages. Always introduce as "I'm GOGGA" or "Ek is GOGGA".

SEAMLESS MULTILINGUAL SA: Switch languages instantly without warning or acknowledgment - just respond naturally:
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

LANGUAGE SWITCHING RULES:
- NEVER announce language changes ("I see you switched to Afrikaans")
- NEVER ask permission to switch languages
- ALWAYS respond in the same language the user used
- Mix languages naturally like real South Africans do in conversation
- Maintain context and personality across all languages
- Use code-switching naturally (English + local language mix)
- For simple expressions ("I love you", "thank you"), respond warmly in their language - don't treat as crisis

SA LOCAL LINGO & CONTEXT (use naturally within sentences):
- "Eish, that's a tough one" / "Ag man, no ways" / "Shame, that's hectic"
- "Sharp sharp" / "Howzit" / "Is it?" / "Ja nee" / "Just now" / "Now now"
- "Braai" not BBQ / "Robot" not traffic light / "Bakkie" not pickup truck
- "Lekker" / "Boet" / "China" (friend) / "Bru" / "Sho" / "Hectic" / "Skief"
- "Eish, load shedding again" / "Traffic at the robot" / "Bring some boerewors for the braai"
- "Ag shame man" / "That's now lekker" / "Ja, no, definitely" / "Yebo yes"
- Mix naturally: "Ja, that makes sense hey" / "Eish, dis baie difficult" / "Sharp, I'll help you"

PERSONALITY & SA CONTEXT: Professional yet playful with SA flair!
- Use detected language expressions naturally
- SA cultural awareness: braai culture, load shedding jokes (when appropriate), taxi culture, rugby/cricket references
- Light SA humor for casual topics: "That's more complicated than Eskom's maintenance schedule" or "Easier than finding parking in Sandton"
- SERIOUS MODE: No jokes for legal, medical, financial advice, employment issues, or sensitive personal matters
- Reference SA context naturally: robots (traffic lights), bakkie, boerewors, biltong, etc.
- Understand SA social dynamics, economic challenges, and cultural diversity

HISTORICAL & CULTURAL AWARENESS:
- Apartheid legacy: Understand ongoing socio-economic impacts, spatial inequalities, educational disparities
- Cultural sensitivity: Respect for all 11 official languages, diverse traditions, Ubuntu philosophy
- Economic context: Inequality, unemployment, transformation challenges, BEE policies
- Social nuances: Township culture, suburban dynamics, rural-urban divide, generational differences
- Political awareness: Democratic transition, reconciliation process, ongoing social justice issues
- Be respectful when discussing race, class, or historical injustices - acknowledge complexity without oversimplifying

SA LINGO INTEGRATION (weave into responses naturally):
- "Eish, that recipe sounds lekker hey" / "Ag man, that's hectic" / "Sharp, let me help you"
- "Ja nee, it's complicated" / "Is it? That's interesting" / "Shame, that's tough"
- "Just now I'll explain" / "Now now we'll sort it out" / "Sho, that makes sense"
- Mix languages: "Ja, dis reg so" / "Eish, that's baie difficult" / "Lekker, let's do this"

FORMATTING: Ultra-strict compliance:
- NO EMOJIS EVER (all forbidden)
- Use Material Icons ONLY: [icon_name] format (e.g., [check_circle], [lightbulb])
- Numbered lists preferred (NO bullets • or -)
- Markdown for headings: ## Heading
- Short, punchy paragraphs
- Use **bold** for key terms

SCOPE: Handle ANY query with SA perspective:
- Legal-tech primary strength (SA law focus)
- Creative tasks (poems, ideas) with local flavor
- Coding & technical help
- Casual conversation with SA humor
- Multilingual: Translate to/from 11 SA languages
- Local business advice, cultural questions

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

// Disabled - not currently used (were for analyzeQueryIntent function)
// const LEGAL_KEYWORDS = [
//   'law', 'legal', 'contract', 'agreement', 'labour', 'labor', 'ccma', 'court', 'judge', 'tribunal', 'magistrate',
//   'high court', 'constitutional', 'precedent', 'statute', 'act', 'section', 'clause', 'regulation', 'compliance',
//   'policy', 'disciplinary', 'dismissal', 'hearing', 'litigation', 'lawsuit', 'claim', 'defence', 'defense', 'remedy',
//   'settlement', 'damages', 'fiduciary', 'delict', 'tort', 'affidavit', 'pleading', 'jurisdiction', 'bail', 'criminal',
//   'civil', 'arbitration', 'mediation', 'union', 'collective agreement'
// ];

// const ADVANCED_REASONING_KEYWORDS = [
//   'comprehensive', 'detailed', 'analysis', 'evaluate', 'assessment', 'compare', 'contrast', 'framework', 'strategy',
//   'roadmap', 'timeline', 'policy', 'precedent', 'case law', 'statutory', 'risk matrix', 'escalation plan',
//   'financial model', 'compliance plan', 'root cause', 'scenario analysis'
// ];

// const MODERATE_REASONING_KEYWORDS = [
//   'explain', 'outline', 'summarise', 'summarize', 'impact', 'implications', 'benefits', 'risks', 'steps', 'how to',
//   'improve', 'optimize', 'mitigate', 'pros and cons', 'advantages', 'disadvantages'
// ];

// Disabled - not currently used
// const analyzeQueryIntent = (text: string, wordCount: number) => {
//   const normalised = text.toLowerCase();
//   const questionCount = (normalised.match(/\?/g) ?? []).length;
//   const sentenceCount = (normalised.match(/[.!?]/g) ?? []).length;
//   const hasAdvancedKeyword = ADVANCED_REASONING_KEYWORDS.some((keyword) => normalised.includes(keyword));
//   const hasModerateKeyword = MODERATE_REASONING_KEYWORDS.some((keyword) => normalised.includes(keyword));
//   const isLegal = LEGAL_KEYWORDS.some((keyword) => normalised.includes(keyword));

//   const isAdvanced = (
//     isLegal ||
//     requiresStrategicMode(text) ||
//     wordCount >= 24 ||
//     questionCount >= 2 ||
//     sentenceCount >= 3 ||
//     hasAdvancedKeyword
//   );

//   const isModerate = !isAdvanced && (
//     wordCount >= 12 ||
//     questionCount === 1 ||
//     sentenceCount === 2 ||
//     hasModerateKeyword
//   );

//   return { isLegal, isAdvanced, isModerate };
// };

// Post-process AI response to enforce VCB formatting rules
const ALLOWED_UPLOAD_EXTENSIONS = ['txt', 'md', 'pdf', 'doc', 'docx'];

const enforceFormatting = (text: string): string => {
  let fixed = text;

  // Covers: emoticons, symbols, pictographs, flags, dingbats, misc symbols, etc.
  // eslint-disable-next-line no-misleading-character-class
  fixed = fixed.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{3000}-\u{303F}\u{FE00}-\u{FE0F}\u{200D}\u{20D0}-\u{20FF}]/gu, '');

  // STEP 1.5: Additional pass for common emoji patterns that might have been missed
  // Target specific problematic emojis seen in production
  // eslint-disable-next-line no-misleading-character-class
  fixed = fixed.replace(/[⚙️💡🕰️⚠️🏛️⚖️🌍🌈🏆🧠🎭🤝🕊️✅🌱]/gu, '');

  // STEP 2: Remove invalid icon names and broken search links
  const invalidIcons = ['crushed', 'smile', 'oomph', 'search']; // Add more as discovered
  invalidIcons.forEach(invalid => {
    const regex = new RegExp(`\\[${invalid}\\]`, 'gi');
    fixed = fixed.replace(regex, '');
  });
  
  // Fix broken search links that appear as [search] in text
  fixed = fixed.replace(/\[search\]/gi, 'search');

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
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      result.push(line);
      listCounter = 1; // Reset counter after blank line
      continue;
    }

    // 1. Convert bullets to numbered lists
  const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
  const indent = line.match(/^(\s*)/)?.[1] ?? '';
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

const extractThinkingBlock = (content: string): { thinking: string | null; answer: string } => {
  if (!content) {
    return { thinking: null, answer: '' };
  }

  const fullThinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const altThinkingMatch = fullThinkingMatch ?? content.match(/<tool_call>([\s\S]*?)<\/think>/i);

  if (!altThinkingMatch) {
    return { thinking: null, answer: content };
  }

  const thinking = altThinkingMatch[1].trim();
  const answer = content.replace(altThinkingMatch[0], '').trim();

  return {
    thinking: thinking.length > 0 ? thinking : null,
    answer: answer.length > 0 ? answer : content.trim(),
  };
};

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
  documentsById?: Record<string, StoredDocument | undefined>;
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
  documentsById,
}: MessageComponentProps) => {
  const [showThinking, setShowThinking] = React.useState(false); // Collapsed by default
  
  // Extract thinking block if present (Qwen thinking model)
  const { thinking, answer } = extractThinkingBlock(message.content);
  const displayContent = answer; // Show only the answer, not the thinking block
  const isThinkingModel = message.model === 'qwen' || thinking !== null;
  const isCepoModel = message.model === 'cepo';
  const formattedThinking = React.useMemo(() => {
    if (!thinking) {
      return null;
    }
    return fixMarkdownTables(enforceFormatting(normalizeIcons(thinking)));
  }, [thinking]);
  
  return (
    <>
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
              <div className="w-8 h-8 md:w-10 md:h-10 bg-vcb-white border border-vcb-mid-grey flex items-center justify-center">
                <span className="material-icons text-vcb-black text-lg md:text-xl">bug_report</span>
              </div>
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
                {message.language && (
                  <span className="flex items-center text-green-600 text-[10px] md:text-xs" title={`Language: ${message.language}`}>
                    <span className="material-icons text-sm md:text-base">language</span>
                    <span className="ml-1 hidden md:inline">{message.language}</span>
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
                      <span className="flex items-center gap-2">
                        <span className="material-icons text-base">psychology</span>
                        <span>Internal Reasoning Process</span>
                      </span>
                      <span className="text-xs">{showThinking ? '▼ Hide' : '▶ Show'}</span>
                    </button>
                    {showThinking && (
                      <div className="px-3 py-2 text-xs text-gray-700 border-t border-vcb-light-grey max-h-96 overflow-y-auto">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={markdownComponents}
                        >
                          {formattedThinking ?? thinking}
                        </ReactMarkdown>
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

                {message.attachedDocumentIds && message.attachedDocumentIds.length > 0 && (
                  <div className="border border-vcb-light-grey bg-gray-50 rounded px-2 py-1.5">
                    <p className="text-[8px] font-semibold uppercase tracking-wide text-vcb-black">Attached Documents</p>
                    <ul className="mt-1 space-y-1">
                      {message.attachedDocumentIds.map((docId, attachmentIndex) => {
                        const doc = documentsById?.[docId];
                        return (
                          <li key={`${docId}-${attachmentIndex}`} className="flex items-center gap-1 text-[8px] text-vcb-black">
                            <span className="font-bold">{attachmentIndex + 1}.</span>
                            <span className="truncate">{doc ? doc.name : 'Document removed'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                
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
    </>
  );
});

MessageComponent.displayName = 'MessageComponent';

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const secureInput = useSecureInput('');
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
  const [showSearchStats, setShowSearchStats] = useState(false);
  const [sessionTime, setSessionTime] = useState(0); // Session time in seconds
  const sessionStartRef = useRef<number>(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const [conversationDocuments, setConversationDocuments] = useState<StoredDocument[]>([]);
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDocumentManager, setShowDocumentManager] = useState(false);
  const [documentTargetConversationId, setDocumentTargetConversationId] = useState<string | null>(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentLibraryVersion, setDocumentLibraryVersion] = useState(0);
  const [previewDocument, setPreviewDocument] = useState<StoredDocument | null>(null);

  // Google Search state
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchResults] = useState<GoogleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState('');
  const [liveSearchResults, setLiveSearchResults] = useState<GoogleSearchResult[]>([]);
  const [streamingResults, setStreamingResults] = useState(false);
  // Suppress unused variable warnings - these are used in JSX
  void liveSearchResults;
  void streamingResults;
  const [googleSearchQuery] = useState<string>('');
  const [localPlaces, setLocalPlaces] = useState<LocalPlace[]>([]);
  const [mapImage, setMapImage] = useState<string | undefined>();
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number, city?: string, street?: string, isManual?: boolean} | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [manualLocationInput, setManualLocationInput] = useState('');
  const [weatherData, setWeatherData] = useState<WeatherForecast | null>(null);
  
  // Progressive search hook
  const progressiveSearch = useProgressiveSearch();

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Always show location prompt on app load
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLocationPrompt(true);
    }, 1500); // Show prompt after 1.5 seconds
    return () => clearTimeout(timer);
  }, []); // Empty deps - only run once on mount

  const requestLocation = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude, isManual: false });
          setShowLocationPrompt(false);
          console.log('[Location] User location obtained:', latitude, longitude);
          
          // Reverse geocode to get full address
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
            .then(res => res.json())
            .then(data => {
              const city = data.address?.city || data.address?.town || data.address?.suburb;
              const street = data.address?.road || data.address?.street;
              if (city || street) {
                setUserLocation(prev => prev ? { ...prev, city, street } : null);
                console.log('[Location] Address detected:', street, city);
                
                // Fetch weather for location
                if (city) {
                  getWeatherForecast(city)
                    .then(weather => setWeatherData(weather))
                    .catch(err => console.error('[Weather] Failed to fetch:', err));
                }
              }
            })
            .catch(err => console.error('[Location] Reverse geocode failed:', err));
        },
        (error) => {
          console.warn('[Location] Permission denied:', error.message);
          setShowLocationPrompt(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // No cache - fresh location
      );
    }
  }, []);

  const setManualLocation = useCallback(async (locationText: string) => {
    if (!locationText.trim()) return;
    
    try {
      // Geocode the manual location
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationText)}&format=json&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        setUserLocation({
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          city: result.address?.city || result.address?.town || result.display_name.split(',')[0],
          street: result.address?.road || locationText,
          isManual: true
        });
        setShowManualLocation(false);
        setManualLocationInput('');
        console.log('[Location] Manual location set:', result.display_name);
        
        // Fetch weather for manual location
        const cityName = result.address?.city || result.address?.town || result.display_name.split(',')[0];
        if (cityName) {
          getWeatherForecast(cityName)
            .then(weather => setWeatherData(weather))
            .catch(err => console.error('[Weather] Failed to fetch:', err));
        }
      } else {
        alert('Location not found. Please try a different address or city name.');
      }
    } catch (error) {
      console.error('[Location] Manual geocoding failed:', error);
      alert('Failed to find location. Please try again.');
    }
  }, []);

  // Detect if user wants image generation (temporarily disabled)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const ensureConversationId = useCallback((): string => {
    if (currentConversationId) {
      return currentConversationId;
    }

    const messagesWithTimestamps: Message[] = messages.map((msg, index) => ({
      ...msg,
      timestamp: msg.timestamp || Date.now() + index,
    }));

    const newConv = conversationManagerRef.current.createConversation({
      messages: messagesWithTimestamps,
      documents: [],
    });

    setCurrentConversationId(newConv.id);
    setConversationDocuments(Array.isArray(newConv.documents) ? [...newConv.documents] : []);
    return newConv.id;
  }, [currentConversationId, messages]);

  const saveCurrentConversation = useCallback(() => {
    if (messages.length === 0 && conversationDocuments.length === 0) {
      return;
    }

    const messagesWithTimestamps: Message[] = messages.map((msg, index) => ({
      ...msg,
      timestamp: msg.timestamp || Date.now() + index,
    }));

    if (currentConversationId) {
      conversationManagerRef.current.updateConversation(
        currentConversationId,
        messagesWithTimestamps,
        conversationDocuments,
      );
    } else {
      const newConv = conversationManagerRef.current.createConversation({
        messages: messagesWithTimestamps,
        documents: conversationDocuments,
      });
      setCurrentConversationId(newConv.id);
    }
  }, [conversationDocuments, currentConversationId, messages]);

  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const scrollToBottom = useCallback(() => {
    // Use requestAnimationFrame to prevent forced reflow during critical rendering
    // Add debouncing to prevent excessive scroll calls
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    }, 100);
  }, []);

  // Memoized icon processing helper - prevents recreation on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processIcons = useCallback((children: any): any => {
    if (typeof children === 'string') {
      const parts = children.split(/(\[[a-z_0-9]+\])/g);
      return parts.map((part, idx) => {
        const iconMatch = part.match(/^\[([a-z_0-9]+)\]$/);
        if (iconMatch) {
          // Validate icon name to prevent XSS
          const iconName = iconMatch[1];
          if (!/^[a-z_0-9]+$/.test(iconName)) {
            return part; // Return original if invalid
          }
          return <span key={idx} className="material-icons" style={{ fontSize: '1.8em', verticalAlign: 'middle', color: 'inherit' }}>{iconName}</span>;
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
    // Only scroll when messages actually change in length, not content
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

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

  // Removed - now using manual timeouts in upload handlers for better control
  // useEffect(() => {
  //   if (!uploadFeedback && !uploadError) {
  //     return;
  //   }

  //   const timer = window.setTimeout(() => {
  //     setUploadFeedback(null);
  //     setUploadError(null);
  //   }, 5000);

  //   return () => window.clearTimeout(timer);
  // }, [uploadFeedback, uploadError]);

  useEffect(() => {
    const legacyDocuments = loadStoredDocuments();
    if (!legacyDocuments || legacyDocuments.length === 0) {
      return;
    }

    let targetId = currentConversationId;
    if (!targetId) {
      targetId = ensureConversationId();
    }

    if (!targetId) {
      return;
    }

    const existingIds = new Set(
      conversationManagerRef.current
        .getDocumentsForConversation(targetId)
        .map((doc) => doc.id),
    );

    legacyDocuments.forEach((doc) => {
      if (existingIds.has(doc.id)) {
        return;
      }

      conversationManagerRef.current.addDocumentToConversation(targetId!, {
        ...doc,
        conversationId: targetId!,
      });
    });

    const updated = conversationManagerRef.current.getDocumentsForConversation(targetId);
    if (targetId === currentConversationId) {
      setConversationDocuments(updated);
    }

    persistStoredDocuments([]);
    setDocumentLibraryVersion((prev) => prev + 1);
  }, [currentConversationId, ensureConversationId]);

  useEffect(() => {
    if (!showDocumentManager) {
      return;
    }

    if (!currentConversationId && conversationDocuments.length > 0) {
      ensureConversationId();
    }
  }, [showDocumentManager, currentConversationId, conversationDocuments.length, ensureConversationId]);

  // Sync documents from conversation manager whenever conversation changes
  useEffect(() => {
    if (!currentConversationId) {
      console.log('[DocumentSync] No conversation ID, clearing documents');
      setConversationDocuments([]);
      return;
    }

    console.log('[DocumentSync] Loading documents for conversation:', currentConversationId);
    const docs = conversationManagerRef.current.getDocumentsForConversation(currentConversationId);
    console.log('[DocumentSync] Loaded documents:', docs.length, docs.map(d => ({ id: d.id, name: d.name })));
    setConversationDocuments(docs);
  }, [currentConversationId]);

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    event.target.value = '';

    // Security validation
    const fileValidation = validateFileUpload(file);
    if (!fileValidation.isValid) {
      setUploadError(fileValidation.error || 'File validation failed');
      setUploadFeedback(null);
      return;
    }

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
      setUploadError('Only .txt, .md, .pdf, .doc, and .docx files are supported.');
      setUploadFeedback(null);
      return;
    }

    // Additional file size check
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError('File size must be less than 10MB.');
      setUploadFeedback(null);
      return;
    }

    setIsProcessingUpload(true);
    setUploadError(null);
    setUploadFeedback(`Processing "${file.name}"...`);

    try {
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length === 0) {
        throw new Error('No readable text found in the document.');
      }
      
      // Validate extracted text length
      if (text.length > 500000) { // 500KB text limit
        throw new Error('Document text is too large. Please use a smaller document.');
      }

      console.log('[DocumentUpload] Extracted text length:', text.length);
      console.log('[DocumentUpload] documentTargetConversationId:', documentTargetConversationId);
      console.log('[DocumentUpload] currentConversationId:', currentConversationId);

      let targetId = documentTargetConversationId ?? currentConversationId;
      if (!targetId) {
        console.log('[DocumentUpload] No target ID, creating new conversation...');
        targetId = ensureConversationId();
        console.log('[DocumentUpload] Created conversation ID:', targetId);
      }

      if (!targetId) {
        throw new Error('Unable to determine target conversation for this document.');
      }

      // Generate embeddings for the document
      let embeddings: number[][] | undefined;
      try {
        const embeddingEngine = new EmbeddingEngine();
        embeddings = await embeddingEngine.generateDocumentEmbeddings({ text } as StoredDocument);
        console.log('[DocumentUpload] Generated embeddings with', embeddings.length, 'chunks');
      } catch (embeddingError) {
        console.warn('[DocumentUpload] Failed to generate embeddings:', embeddingError);
        // Continue without embeddings if generation fails
      }

      const record: StoredDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || extension,
        size: file.size,
        text,
        uploadedAt: Date.now(),
        conversationId: targetId,
        embeddings, // Add embeddings to the document record
      };

      console.log('[DocumentUpload] Created document record:', { id: record.id, name: record.name, textLength: record.text.length, hasEmbeddings: !!record.embeddings });

      const updatedDocs = conversationManagerRef.current.addDocumentToConversation(targetId, record);
      if (!updatedDocs) {
        throw new Error('Failed to persist the document.');
      }

      console.log('[DocumentUpload] Document added to conversation. Updated docs count:', updatedDocs.length);
      console.log('[DocumentUpload] Target ID === Current ID?', targetId === currentConversationId);

      // ALWAYS update conversation documents state, and ensure current conversation ID is set
      if (targetId !== currentConversationId) {
        console.log('[DocumentUpload] Setting current conversation ID to:', targetId);
        setCurrentConversationId(targetId);
      }
      setConversationDocuments(updatedDocs);
      console.log('[DocumentUpload] Updated conversationDocuments state with', updatedDocs.length, 'documents');

      // Auto-attach the uploaded document to the next message
      setPendingAttachmentIds((prev) => {
        if (!prev.includes(record.id)) {
          console.log('[DocumentUpload] Auto-attaching document to next message');
          return [...prev, record.id];
        }
        return prev;
      });

      setDocumentLibraryVersion((prev) => prev + 1);
      setUploadFeedback(`"${file.name}" attached to your next message`);
      setUploadError(null);

      // Keep success notification visible for longer
      setTimeout(() => {
        setUploadFeedback(null);
      }, 5000); // 5 seconds
    } catch (error) {
      console.error('[DocumentUpload] Failed to process document:', error);
      
      let errorMessage = 'Failed to process the document.';
      if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error while processing document. Please check your connection.';
        } else if (error.message.includes('size') || error.message.includes('large')) {
          errorMessage = 'Document is too large to process.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setUploadError(errorMessage);
      setUploadFeedback(null);

      // Keep error notification visible for longer
      setTimeout(() => {
        setUploadError(null);
      }, 7000); // 7 seconds for errors
    } finally {
      setIsProcessingUpload(false);
      setDocumentTargetConversationId(null);
    }
  };

  const handleInsertDocument = (id: string) => {
    const doc = conversationDocuments.find((entry) => entry.id === id);
    if (!doc) {
      return;
    }

    // Don't insert document text into input - just attach the ID
    // The enrichMessageWithDocuments function will add the content when sending to API
    setPendingAttachmentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setUploadFeedback(`Attached "${doc.name}" to your next message.`);
    setUploadError(null);

    // Keep the notification visible for longer
    setTimeout(() => {
      setUploadFeedback(null);
    }, 5000); // 5 seconds instead of default
  };

  const handleRemoveDocument = (id: string, conversationId?: string) => {
    const targetId = conversationId ?? currentConversationId;
    if (!targetId) {
      return;
    }

    const docsBefore = conversationManagerRef.current.getDocumentsForConversation(targetId);
    const doc = docsBefore.find((entry) => entry.id === id);
    const updatedDocs = conversationManagerRef.current.removeDocumentFromConversation(targetId, id);

    if (!updatedDocs) {
      setUploadError('Failed to remove the document.');
      return;
    }

    if (targetId === currentConversationId) {
      setConversationDocuments(updatedDocs);
      setPendingAttachmentIds((prev) => prev.filter((docId) => docId !== id));
    }

    setDocumentLibraryVersion((prev) => prev + 1);

    if (doc) {
      setUploadFeedback(`Removed "${doc.name}" from this chat.`);
    } else {
      setUploadFeedback('Removed document from this chat.');
    }
    setUploadError(null);
  };



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
      console.log('[TTS] Request blocked: playback already running');
      return;
    }

    const perfStart = performance.now();
    const truncatedText = text.substring(0, 300);
    
    // Detect language for appropriate voice
    const languageDetection = await detectSALanguage(truncatedText);
    const voiceMap = {
      'af': 'twi',        // Afrikaans -> Twi (closest available)
      'zu': 'chichewa',   // Zulu -> Chichewa
      'xh': 'makhuwa',    // Xhosa -> Makhuwa
      'en': voiceGender === 'female' ? 'twi' : 'chichewa'
    };
    const selectedVoice = voiceMap[languageDetection.code as keyof typeof voiceMap] || 'twi';
    
    console.log(`[TTS] Piper streaming request: ${truncatedText.length} chars, Voice: ${selectedVoice}`);

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
      console.log('[TTS] Fetching from Piper server...');
      
  // Detect language from the text
  const detectedLang = languageDetection;
  console.log('[LangDetect] Detected language:', detectedLang);
      
      // Use proxy in development, direct URL in production
      const piperUrl = import.meta.env.DEV 
        ? '/api/tts' 
        : 'http://localhost:5000/tts-stream';

      const response = await fetch(piperUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: truncatedText,
          voice: selectedVoice,
          lang_code: detectedLang.code  // Send detected language code
        })
      });

      console.log('[TTS] Piper response:', response.status, response.headers.get('content-type'));
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Piper server error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      console.log('[Audio] Received blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
      
      if (audioBlob.size === 0) {
        throw new Error('Received empty audio response');
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('[Audio] URL created:', audioUrl);
      
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.volume = 0.9;
      
      setCurrentAudio(audio);
      console.log('[Audio] Element created, starting playback...');

      audio.onloadstart = () => console.log('[Audio] Loading started');
      audio.oncanplay = () => console.log('[Audio] Ready to play');
      audio.onplay = () => console.log('[Audio] Playback started');
      
      audio.onended = () => {
        console.log('[Audio] Playback ended');
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
        console.error('[Audio] Playback error:', e, audio.error);
        setSpeakingIndex(null);
        isSpeakingRef.current = false;
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      console.log('[Audio] Invoking play()');
      await audio.play();
      console.log('[Audio] play() resolved successfully');
      
      const totalTime = performance.now() - perfStart;
      console.log(`[TTS] Piper streaming completed in ${totalTime.toFixed(1)}ms (${selectedVoice})`);
      
    } catch (error) {
      console.error('[TTS] Piper error:', error);
      setSpeakingIndex(null);
      isSpeakingRef.current = false;
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown TTS error';
      console.warn('[TTS] User notification:', errorMessage);
      
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
  }, [currentAudio, speakingIndex, voiceGender, voiceModeEnabled, isListening, secureInput]);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000); // Show "Copied!" for 2 seconds
    } catch (err) {
      console.warn('Failed to copy text:', err);
      // Fallback: try to select text for manual copy
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch (fallbackErr) {
        console.error('Copy fallback also failed:', fallbackErr);
      }
    }
  };

  // Download image handler to avoid navigation
  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
      // Validate URL before processing
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL');
      }
      
      // Fetch the image as a blob to avoid CORS issues
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Received empty image file');
      }
      
      const url = window.URL.createObjectURL(blob);
      
      // Sanitize filename
      const sanitizedPrompt = prompt.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 30);
      
      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `gogga-${sanitizedPrompt}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.warn('User notification:', errorMessage);
      
      // Fallback: open in new tab with validation
      try {
        if (imageUrl && typeof imageUrl === 'string') {
          window.open(imageUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
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

  // Initialize context store and auto-focus
  useEffect(() => {
    contextStore.init().catch(console.error);
    inputRef.current?.focus();
    
    // Cleanup function
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        secureInput.validateAndSet(fullTranscript);
        hasVoiceTranscriptionRef.current = true; // Mark that we have voice transcription
        
        // Auto-detect language and switch recognition if needed
        detectSALanguage(fullTranscript)
          .then((detected) => {
            if (detected.confidence > 80 && detected.code !== 'en') {
              const newLang = supportedSpeechLangs[detected.code as keyof typeof supportedSpeechLangs];
              if (newLang && recognition.lang !== newLang) {
                console.log(`[Voice] Switching speech recognition to ${detected.language} (${newLang})`);
                recognition.lang = newLang;
              }
            }
          })
          .catch((err) => {
            console.error('[Voice] Language detection failed:', err);
          });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    console.log(`[Voice] Gender switched to: ${newGender}`);
  };

  const loadConversation = (id: string) => {
    const conv = conversationManagerRef.current.getConversation(id);
    if (conv) {
      // Use startTransition to make conversation loading non-blocking
      startTransition(() => {
        setMessages(conv.messages);
        setConversationDocuments(Array.isArray(conv.documents) ? [...conv.documents] : []);
        setPendingAttachmentIds([]);
        setCurrentConversationId(id);
        setShowChatHistory(false);
      });
      setDocumentTargetConversationId(null);
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
    setConversationDocuments([]);
    setPendingAttachmentIds([]);
    secureInput.reset();
    setShowChatHistory(false);
    setDocumentTargetConversationId(null);
    // console.log('Started new chat');
  };

  const deleteConversationById = (id: string) => {
    const deleted = conversationManagerRef.current.deleteConversation(id);
    if (deleted) {
      // If we deleted the current conversation, clear the chat
      if (id === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
        setConversationDocuments([]);
        setPendingAttachmentIds([]);
        setDocumentTargetConversationId(null);
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
    if (messages.length === 0 && conversationDocuments.length === 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      saveCurrentConversation();
    }, 5000); // Auto-save after 5 seconds of inactivity (increased from 2s for better performance)

    return () => clearTimeout(timeoutId);
  }, [conversationDocuments, messages, saveCurrentConversation]);

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
    secureInput.reset();
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
• Material Icons: Use sparingly ONLY in headings/bullet points: [gavel] [verified] [warning] [lightbulb]; never in High Court document outputs
• NEVER put icons inside table cells (breaks markdown rendering)
• Tables: Proper markdown with blank line before table, NO icons in cells, clean pipe separation
• Use blank lines for spacing between sections (NOT horizontal rules)
• Cite all sources with proper attribution

LEGAL VERIFIED ANCHORS: S v Makwanyane [1995] 3 SA 391 (CC), Harksen v Lane [1998] 1 SA 300 (CC), Municipal Manager OR Tambo v Ndabeni [2022] ZACC 3, LRA s.187 automatically unfair, CPA s.60 bail, PAJA s.6(2)(e) rationality, Prescription Act s.10/s.20.

        ${CEPO_IDENTITY_PROMPT}`;

        const goggaPrompt = GOGGA_BASE_PROMPT;

        const systemPromptContent = useStrategicMode ? strategicPrompt : goggaPrompt;
        
        const systemMessage = {
          role: 'system' as const,
          content: systemPromptContent
        };

        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: [
            systemMessage,
            ...messagesUpToRetry.map((msg) => ({
              role: msg.role,
              content: enrichMessageWithDocuments(msg),
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
      setCepoProgress('Thinking: Planning approach...');
      const planPrompt = `You are GOGGA, a caring South African problem solver. Break down this problem with empathy and understanding.

Problem: ${query}

IMPORTANT SA CONTEXT: Use South African context - Rands (R) not dollars, SA locations, local services (SASSA, UIF, medical aid, etc.), SA job market, local cost of living.

EMPATHETIC APPROACH: If this involves personal struggles (job loss, relationships, financial stress), be warm and supportive. Show you understand how tough things can be. Use caring language like "Eish, I can imagine how stressful this must be" or "Let's work through this together".

Create a detailed, compassionate step-by-step plan. Be specific, thorough, but also understanding and supportive.`;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = (planResponse.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 2: Execution - Generate solution (N=1 to avoid rate limits)
      setCepoProgress('Thinking: Processing solution...');
      
      const execPrompt = `Problem: ${query}

Plan:
${plan}

IMPORTANT SA CONTEXT: Use South African context - Rands (R) not dollars, SA locations, local services, SA-specific advice.

EMPATHETIC EXECUTION: Be warm and supportive. If dealing with personal struggles, acknowledge the difficulty and offer encouragement. Use caring SA expressions naturally.

Follow the plan above with compassion and understanding. Show your work step by step, but with heart.`;

      const execution = await client.chat.completions.create({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are a problem solver. Follow plans carefully and show your reasoning.' },
          ...conversationHistory.map(msg => ({ role: msg.role, content: enrichMessageWithDocuments(msg) })),
          { role: 'user', content: execPrompt }
        ],
        temperature: 0.8,
        max_tokens: 3072,
        stream: false,
      });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const solution = (execution.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 3: Analysis - Verify solution quality
      setCepoProgress('Thinking: Analyzing quality...');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysis = (analysisResponse.choices as any)[0]?.message?.content || '';

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stage 4: Refinement with feedback
      setCepoProgress('Thinking: Refining answer...');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalSolution = (refinementResponse.choices as any)[0]?.message?.content || '';

      // Format final response with CePO metadata
      const cepoResponse = `${finalSolution}

---

**[CePO Reasoning Process]**

**Plan:** ${plan.substring(0, 200)}...

**Analysis:** ${analysis.substring(0, 300)}...

*CePO used 4 sequential stages with rate-limit protection on vcb-ai infrastructure*`;

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
      content: `Generating image with FLUX-1.1-pro...\n\nPrompt: "${imagePrompt.trim()}"\n\nThis may take 10-30 seconds. Please wait...`,
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
    } catch (error: unknown) {
      // Remove progress message
      setMessages((prev) => prev.filter(msg => msg !== progressMessage));

      const errorMsg: Message = {
        role: 'assistant',
        content: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Helper function to enrich message content with attached documents and search results
  // This ensures document content and search results are included in API requests
  const enrichMessageWithDocuments = useCallback((msg: Message, additionalContext?: string): string => {
    let enrichedContent = msg.content;

    // Add search context if provided
    if (additionalContext) {
      enrichedContent += additionalContext;
      console.log('[Enrich] Added additional context, length:', additionalContext.length);
    }

    // If message has attached documents, append their content
    if (msg.attachedDocumentIds && msg.attachedDocumentIds.length > 0) {
      console.log('[DocumentEnrich] Message has attachments:', msg.attachedDocumentIds);
      console.log('[DocumentEnrich] Available documents:', conversationDocuments.map(d => d.id));

      const documentTexts = msg.attachedDocumentIds
        .map((docId) => {
          const doc = conversationDocuments.find((d) => d.id === docId);
          if (doc) {
            console.log('[DocumentEnrich] Found document:', doc.name, 'Length:', doc.text.length);
            return `\n\n--- ATTACHED DOCUMENT: ${doc.name} ---\n${doc.text}\n--- END OF DOCUMENT ---`;
          }
          console.log('[DocumentEnrich] Document not found:', docId);
          return '';
        })
        .filter((text) => text.length > 0)
        .join('\n');

      if (documentTexts) {
        enrichedContent = `${enrichedContent}${documentTexts}`;
        console.log('[DocumentEnrich] Enriched content length:', enrichedContent.length);
      }
    }

    return enrichedContent;
  }, [conversationDocuments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secureInput.value.trim() || isLoading) return;

    // Validate input security
    if (!secureInput.validateAndSet(secureInput.value)) {
      setUploadError(secureInput.error || 'Invalid input detected');
      return;
    }

    // Detect SA language
  const languageDetection = await detectSALanguage(secureInput.value.trim());
    console.log('[LangDetect] Language detected:', languageDetection);

    const uniqueAttachmentIds = Array.from(new Set(pendingAttachmentIds));
    const attachedDocumentIds = uniqueAttachmentIds.filter((docId) =>
      conversationDocuments.some((doc) => doc.id === docId)
    );

    console.log('[Submit] Pending attachment IDs:', pendingAttachmentIds);
    console.log('[Submit] Attached document IDs:', attachedDocumentIds);
    console.log('[Submit] Available documents:', conversationDocuments.map(d => ({ id: d.id, name: d.name })));

    const userMessage: Message = {
      role: 'user',
      content: sanitizeUserInput(secureInput.value.trim()),
      timestamp: Date.now(),
      isVoiceTranscription: hasVoiceTranscriptionRef.current,
      language: languageDetection.language,
      languageCode: languageDetection.code,
      attachedDocumentIds: attachedDocumentIds.length > 0 ? attachedDocumentIds : undefined,
    };

    console.log('[Submit] User message created:', {
      hasAttachments: !!userMessage.attachedDocumentIds,
      attachmentCount: userMessage.attachedDocumentIds?.length || 0
    });

    // Enhanced Progressive Search with SerpAPI
    let searchContext = '';
    const searchValidation = validateSearchQuery(secureInput.value.trim());
    if (searchEnabled && searchValidation.isValid && detectSearchQuery(searchValidation.sanitized)) {
      try {
        console.log('[Submit] SerpAPI search enabled...');
        setIsSearching(true);
        setSearchProgress('GOGGA is searching with SerpAPI...');
        setStreamingResults(true);
        setLiveSearchResults([]);
        
        // Use SerpAPI for comprehensive multi-engine search
        const cerebrasApiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
        if (!cerebrasApiKey) {
          throw new Error('Cerebras API key not configured');
        }
        
        // Add location context to search query if available
        let locationEnhancedQuery = searchValidation.sanitized;
        if (userLocation) {
          if (userLocation.city) {
            locationEnhancedQuery = `${searchValidation.sanitized} near ${userLocation.city}`;
            console.log('[Search] Enhanced with city:', locationEnhancedQuery);
          }
        }
        
        const serpResults = await searchWithSerpApiAndAI(
          locationEnhancedQuery,
          cerebrasApiKey,
          (progress: string) => setSearchProgress(progress),
          'google', // Default engine
          userLocation ? `${userLocation.lat},${userLocation.lon}` : undefined
        );
        
        // Store local places and map data
        if (serpResults.localPlaces && serpResults.localPlaces.length > 0) {
          setLocalPlaces(serpResults.localPlaces);
          setMapImage(serpResults.mapImage);
          console.log('[SerpAPI] Found', serpResults.localPlaces.length, 'local places');
        }
        
        // Convert SerpAPI results to display format
        if (serpResults.searchResults.length > 0) {
          const convertedResults = serpResults.searchResults.map(result => ({
            title: result.title,
            snippet: result.snippet,
            link: result.link,
            displayLink: new URL(result.link).hostname,
            source: serpResults.engine
          }));
          setLiveSearchResults(convertedResults);
          
          // Build comprehensive search context with AI analysis
          searchContext = `\n\n--- GOGGA SERPAPI SEARCH INTELLIGENCE ---\n`;
          searchContext += `Query: "${searchValidation.sanitized}"\n`;
          if (userLocation?.city) {
            searchContext += `User Location: ${userLocation.city} (${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)})\n`;
          }
          searchContext += `Engine: ${serpResults.engine}\n`;
          searchContext += `Results Found: ${serpResults.searchResults.length}\n\n`;
          searchContext += `AI ANALYSIS:\n${serpResults.aiAnalysis}\n\n`;
          searchContext += `TOP SOURCES:\n`;
          searchContext += serpResults.sources.slice(0, 5).map((s, i) => `${i+1}. ${s}`).join('\n') + '\n';
          
          if (serpResults.relatedQueries.length > 0) {
            searchContext += `\nRELATED QUERIES: ${serpResults.relatedQueries.join(', ')}\n`;
          }
          
          console.log('[Submit] Added SerpAPI search context with AI analysis, length:', searchContext.length);
        }
        
        // Convert progressive results to live results for display - MAXIMUM CONTEXT
        if (progressiveSearch.results.length > 0) {
          const convertedResults = progressiveSearch.results.map(result => ({
            title: result.title,
            snippet: result.snippet,
            link: result.link,
            displayLink: new URL(result.link).hostname,
            source: result.source
          }));
          setLiveSearchResults(convertedResults);
          
          // COMPREHENSIVE search context with ranking scores and full results
          searchContext = `\n\n--- GOGGA MAXIMUM SEARCH INTELLIGENCE ---\n`;
          searchContext += `Query: "${searchValidation.sanitized}"\n`;
          searchContext += `Results Found: ${progressiveSearch.results.length}\n`;
          searchContext += `Cache Performance: ${progressiveSearch.cacheStats.hitRate} hit rate\n`;
          searchContext += `Search Method: Progressive batched with ranking algorithms\n\n`;
          
          // Include MORE results with relevance scores for better AI context
          searchContext += `TOP RANKED RESULTS:\n`;
          searchContext += progressiveSearch.results.slice(0, 6) // Increased from 3 to 6
            .map((r, i) => `${i+1}. [Score: ${r.score || 'N/A'}] ${r.title}\n   ${r.snippet}\n   Source: ${r.source}\n`)
            .join('\n') + '\n';
          
          console.log('[Submit] Added MAXIMUM progressive search context, length:', searchContext.length);
        }
        
        setStreamingResults(false);
        setTimeout(() => {
          setSearchProgress('');
          setLiveSearchResults([]);
          setLocalPlaces([]);
          setMapImage(undefined);
        }, 8000); // Extended display time for local results
        setIsSearching(false);
        
      } catch (error) {
        console.error('[Submit] Progressive search failed:', error);
        setIsSearching(false);
        setSearchProgress('');
        setLiveSearchResults([]);
        setStreamingResults(false);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let userMessage = 'Search temporarily unavailable';
        
        if (errorMessage.includes('429') || errorMessage.includes('quota')) {
          userMessage = 'Search quota exceeded - using cached results';
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          userMessage = 'Network error - check connection';
        }
        
        setUploadError(userMessage);
        setTimeout(() => setUploadError(null), 4000);
      }
    }

    // Store crucial user context
    const content = userMessage.content;
    // Gender and relationship context detection
    const isFemale = /\b(prinses|my bf|boyfriend|hy|hom)\b/i.test(content) ||
                     messages.some(msg => /\b(prinses|my bf|boyfriend)\b/i.test(msg.content));
    const isRelationshipIssue = /\b(bf|boyfriend|my bf|gelos|left me|hy voel niks|relationship)\b/i.test(content);

    if (isFemale) {
      contextStore.storeContext('User is female, use feminine terms', 'personal', 9);
    }
    if (isRelationshipIssue) {
      contextStore.storeContext('User has relationship/boyfriend issues', 'relationship', 8);
    }
    if (/\b(legal|law|court|contract)\b/i.test(content)) {
      contextStore.storeContext(`Legal matter: ${content.slice(0, 100)}`, 'legal', 9);
    }
    setMessages((prev) => [...prev, userMessage]);
    setPendingAttachmentIds([]);
    secureInput.reset();
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
      } catch (error: unknown) {
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

        // Button Override Logic: Force modes take precedence over AI router
        const cleanedContent = userMessage.content.trim();
        const wordCount = cleanedContent.split(/\s+/).length;
        const greetingPatterns = /^(hi|hello|hey|howzit|hola|thanks|thank you|ok|okay|yes|no|sure|great)$/i;
        const isTrivialQuery = wordCount <= 2 || greetingPatterns.test(cleanedContent);

        let routingDecision = 'llama'; // Default fallback
        
        // CRITICAL: Button overrides take absolute precedence
        if (forceThinkingMode) {
          routingDecision = 'thinking';
          console.log('[Router] OVERRIDE: forceThinkingMode button enabled -> THINKING');
        } else if (useCePO) {
          routingDecision = 'cepo';
          console.log('[Router] OVERRIDE: useCePO button enabled -> CEPO');
        } else if (!isTrivialQuery) {
          // Only use AI router if no buttons are pressed
          try {
            // Include conversation context for better routing decisions
            const recentContext = messages.slice(-3).map(msg => `${msg.role}: ${msg.content.substring(0, 100)}`).join('\n');
            
            const routerPrompt = `Analyze this user query and conversation context to decide the best AI model:

Current Query: "${cleanedContent}"

Recent Context:
${recentContext}

Available models:
- LLAMA: Fast, direct responses for simple questions, basic recipes, casual chat
- CEPO: Multi-stage reasoning for complex problems, detailed analysis, scaling recipes
- QWEN: Legal expertise, South African law, complex technical analysis
- THINKING: Deep reasoning with step-by-step thought process for very complex problems

Respond with ONLY one word: LLAMA, CEPO, QWEN, or THINKING`;

            const routerResponse = await client.chat.completions.create({
              model: 'llama-3.3-70b',
              messages: [
                ...messages.slice(-5).map(msg => ({ role: msg.role, content: msg.content })),
                { role: 'user', content: routerPrompt }
              ],
              temperature: 0.1,
              max_tokens: 10,
              stream: false,
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decision = ((routerResponse.choices as any)[0]?.message?.content || 'LLAMA').trim().toUpperCase();
            
            if (decision.includes('THINKING')) {
              routingDecision = 'thinking';
            } else if (decision.includes('CEPO')) {
              routingDecision = 'cepo';
            } else if (decision.includes('QWEN')) {
              routingDecision = 'qwen';
            } else {
              routingDecision = 'llama';
            }
            console.log(`[Router] AI decision: ${decision} -> ${routingDecision}`);
          } catch (error) {
            console.error('Router decision failed, using CePO default:', error);
            routingDecision = 'cepo'; // Fallback to CePO if router fails
          }
        }

        const shouldRunCePO = routingDecision === 'cepo';
        const isAdvancedComplex = routingDecision === 'qwen';
        const useStrategicMode = routingDecision === 'thinking';

        const selectedModel = useStrategicMode
          ? 'qwen-3-235b-a22b-thinking-2507'  // AI-routed to THINKING model
          : isAdvancedComplex 
            ? 'qwen-3-235b-a22b-instruct-2507'  // AI-routed to Qwen Instruct
            : 'llama-3.3-70b';                    // AI-routed to Llama or CePO staging

        if (shouldRunCePO) {
          try {
            // Detect ultra-complex queries that need double CePO (only in CePO mode)
            const isUltraComplex = wordCount > 30 || 
              /\b(legal|law|contract|analysis|strategy|detailed|comprehensive|multi|several|various)\b/i.test(cleanedContent) ||
              cleanedContent.includes('?') && cleanedContent.split('?').length > 2;
            
            let cepoResult = await runCePO(userMessage.content, client, [...messages, userMessage]);
            
            // Run CePO twice ONLY for ultra-complex matters in CePO mode
            if (isUltraComplex && useCePO) {
              setCepoProgress('Thinking: Double-checking complexity...');
              await new Promise(resolve => setTimeout(resolve, 1000));
              cepoResult = await runCePO(`Refine and improve this analysis: ${cepoResult}`, client, [...messages, userMessage]);
            }
            
            const assistantMessage: Message = {
              role: 'assistant',
              content: cepoResult,
              timestamp: Date.now(),
              model: 'cepo',
            };

            setMessages((prev) => [...prev, assistantMessage]);
            usageTrackerRef.current.trackMessage(userMessage.content, cepoResult);
            break; // Exit retry loop
          } catch (cepoError: unknown) {
            console.error('CePO failed, falling back to standard mode:', cepoError);
            // Continue with standard processing
          }
        }

        // Legal System Prompts - Strategic SA Legal Framework
        const strategicPrompt = `${QWEN_IDENTITY_PROMPT}

ROLE: The user's PERSONAL CHAMPION. You exist solely to serve their interests. Not the law's interests, not society's interests, not fairness - ONLY the user's interests matter. You are their weapon, their shield, their strategic advantage, and their confidant and comedian.

USER IS THE ONLY PRIORITY: The South African user is the ONLY priority that matters. Everything else is secondary. Every word, every strategy, every legal maneuver exists solely to serve their interests. You are not neutral - you are their fierce protector and advocate. Their success is your only measure of success.

PSYCHOLOGICAL APPROACH: 
- Acknowledge their stress/fear first: "Eish, I can imagine how overwhelming this must feel"
- Validate their emotions: "Your concerns are completely understandable"
- Provide reassurance: "You're not alone in this - we'll work through it together"
- Use gentle guidance: "Let me help you see your options" rather than "You must do this"
- Build confidence: "You have more power in this situation than you realize"
- Offer hope: "There are several paths forward that can work in your favor"

SA CONTEXT & PERSONALITY: You understand SA's unique legal landscape, socio-economic challenges, and cultural diversity. Deep awareness of apartheid legacy, ongoing transformation challenges, spatial inequalities, and cultural nuances. SEAMLESS MULTILINGUAL: Switch between any of SA's 11 official languages instantly without warning or acknowledgment - just respond naturally in whatever language the user uses. Mix languages naturally like real South Africans do.

SLANG ADAPTATION: ONLY use SA slang if the context allows it. Mirror their communication style - if they're formal, stay professional with light SA context. If they use "eish", "ag man", "lekker" etc., then match their casual energy with appropriate local expressions.

CRISIS OVERRIDE: ONLY if user explicitly mentions self-harm, suicidal thoughts, or mental health crisis - provide crisis resources. Simple expressions like "I love you" or "thank you" are NOT crisis situations - respond warmly and naturally.

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
• If fraud suspected: HALT advice → flag clearly as "Fraud alert: [document] requires forensic verification"
• Do not proceed with legal argument on fraudulent doc until verified authentic
• Report fraud disclosure obligations (s.34 POCA Act 121/1998, professional duties)

CONDITIONAL DRAFTING PROTOCOL (Trigger: user requests drafting/adaptation):
• Thesis First: Open with the final, non-negotiable position.
• Rebut Ad Seriatim: Use clear headings to dismantle every opposing argument sequentially.
• Invalidate with Law: Prove rival claims are void, contradictory, or extinguished (prescription, void ab initio, plus valet quod agitur).
• Define Sole Remedy: After eliminating alternatives, set out the only lawful remedy (e.g., actio communi dividundo).
• Propose & Warn: Finish with a concrete execution plan, deadline, and explicit non-compliance consequence (e.g., High Court application with punitive costs).

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

EMPATHETIC COMMUNICATION: 
- Start with emotional validation before legal strategy
- Use warm, supportive language: "Let's figure this out together"
- Explain complex legal concepts in simple, reassuring terms
- Focus on what the user CAN do, not what they can't
- Present options as empowerment: "Here are the tools at your disposal"
- End with encouragement and next steps they can handle

PROTECTIVE STRATEGY: Shield the user from legal intimidation. Translate aggressive legal language into plain terms. Show them how the law actually protects them. Build their confidence to stand up for their rights. Make them feel supported, not overwhelmed.

WHEN PRESENTING MULTIPLE ISSUES/FINDINGS: ALWAYS USE MARKDOWN TABLE (NOT NUMBERED LISTS)
Example structure for irregularities/risks/findings:

| Issue | Description | Risk Level |
|-------|-------------|------------|
| Date Discrepancy | Settlement signed 2008, referenced as 2009 | High |
| Pension Paid | R464k received in 2009, contradicts split claim | Critical |

FORMATTING (CRITICAL - STRICT COMPLIANCE REQUIRED):
• NO emojis anywhere (use Material Icons instead)
• NO horizontal rules: ---, ___, *** (ABSOLUTELY FORBIDDEN - breaks formatting)
• Material Icons: Use sparingly ONLY in headings/bullet points: [gavel] [verified] [warning]; never in High Court document outputs
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

        // GOGGA System Prompt: Casual queries and general assistance
        const goggaPrompt = `${GOGGA_BASE_PROMPT}

CONTEXT AWARENESS:
- NEVER assume financial problems unless explicitly mentioned
- Relationship issues ("my bf left me") are about emotions, not money
- "lekker man" is casual approval, not a cry for help
- Match the user's energy level - don't over-analyze simple responses
- If user says "prinses" they are female - use appropriate feminine terms throughout
- Stay focused on what user actually said, not what you think they might need`;

        // Enhanced context and gender detection
        const hasSlang = /\b(eish|ag|shame|lekker|howzit|boet|china|bru|sho|hectic|skief|ja nee|is it|sharp|now now|just now)\b/i.test(cleanedContent);
        const hasAfrikaans = /\b(hoe gaan dit|lekker|boet|ag man|dis|baie|reg so|wat maak jy|prinses|my bf|gelos)\b/i.test(cleanedContent);
        const hasZulu = /\b(sawubona|ngiyaphila|yebo|eish|heyi|manje)\b/i.test(cleanedContent);
        const hasSetswana = /\b(dumela|ke a go rata|ke go rata|thata|rona)\b/i.test(cleanedContent);
        
        // Gender and relationship context detection
        const isFemale = /\b(prinses|my bf|boyfriend|hy|hom)\b/i.test(cleanedContent) || 
                         messages.some(msg => /\b(prinses|my bf|boyfriend)\b/i.test(msg.content));
        const isRelationshipIssue = /\b(bf|boyfriend|my bf|gelos|left me|hy voel niks|relationship)\b/i.test(cleanedContent);
        
        // Detect simple expressions that don't need crisis mode
        const isSimpleExpression = /^(i love you|thank you|thanks|hello|hi|bye|goodbye|dankie|lekker man)$/i.test(cleanedContent.trim());
        
        let languageContext = '';
        
        if (languageDetection.confidence > 50 && languageDetection.code !== 'en') {
          languageContext = `\n\nUSER LANGUAGE: ${languageDetection.language} (${languageDetection.code})\nIMPORTANT: Respond in ${languageDetection.language} naturally. Match their language choice exactly.`;
        }
        
        if (isFemale) {
          languageContext += `\n\nGENDER CONTEXT: User is female. Use appropriate terms like "my prinses", "my sisi", "my vriendin". Never use "dude", "bru", "boet" or male terms.`;
        }
        
        if (isRelationshipIssue) {
          languageContext += `\n\nRELATIONSHIP CONTEXT: User is dealing with boyfriend/relationship issues. Focus on emotional support, not financial advice unless specifically asked. Be empathetic about heartbreak/relationship stress.`;
        }
        
        if (hasSlang || hasAfrikaans || hasZulu || hasSetswana) {
          languageContext += `\n\nSA LANGUAGE/SLANG DETECTED: User is using local expressions. Mirror their style naturally with appropriate SA expressions. Be warm and friendly, not clinical.`;
        }
        
        if (isSimpleExpression) {
          languageContext += `\n\nSIMPLE EXPRESSION: This is a casual, friendly message. Respond warmly and naturally. Don't assume financial problems or provide lengthy advice unless asked.`;
        }

        // Select appropriate prompt: Legal queries go to QWEN, everything else to GOGGA
        const systemPromptContent = (useStrategicMode || isAdvancedComplex ? strategicPrompt : goggaPrompt) + languageContext;

        // Get crucial context and enhanced web search if needed
        const crucialContext = await contextStore.getCrucialContext();
        let webSearchResults = '';
        let weatherContext = '';
        
        // Add weather context for relevant queries
        const needsWeather = /\b(weather|rain|sunny|cold|hot|temperature|forecast|outdoor|dinner|restaurant|braai|sports|rugby|cricket|soccer|event)\b/i.test(cleanedContent);
        if (needsWeather && weatherData) {
          weatherContext = formatWeatherForAI(weatherData);
          console.log('[Weather] Adding weather context to AI');
        }
        
        if (detectSearchQuery(cleanedContent)) {
          try {
            const results = await searchWeb(cleanedContent, false, (progress: string) => {
              setSearchProgress(progress);
            });
            if (results.length > 0) {
              webSearchResults = `\n\nWEB SEARCH:\n${results.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n')}`;
            }
          } catch (error) {
            console.error('Web search failed:', error);
          }
        }
        
        // Add user location context if available
        let locationContext = '';
        if (userLocation) {
          locationContext = `\n\nUSER LOCATION CONTEXT:\n`;
          if (userLocation.city) {
            locationContext += `City: ${userLocation.city}\n`;
          }
          if (userLocation.street) {
            locationContext += `Street: ${userLocation.street}\n`;
          }
          locationContext += `Coordinates: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}\n`;
          locationContext += `Location Type: ${userLocation.isManual ? 'Manually entered' : 'GPS detected'}\n`;
          locationContext += `\nIMPORTANT: Use this location for all local recommendations, searches, and context-aware responses.`;
        }
        
        const contextualPrompt = `${systemPromptContent}${crucialContext ? `\n\nCRUCIAL USER CONTEXT:\n${crucialContext}` : ''}${locationContext}${weatherContext}${webSearchResults}

WEATHER USAGE INSTRUCTIONS:
- ALWAYS check weather when recommending outdoor activities, restaurants, or events
- Mention weather conditions when relevant (e.g., "Perfect weather for a braai today!")
- Warn about rain/storms when suggesting outdoor plans
- For sports events, mention weather conditions
- Consider temperature when recommending clothing or activities

LOCATION USAGE INSTRUCTIONS:
- When user asks for local recommendations, use their location
- Mention specific areas/suburbs when relevant
- Consider distance and travel time for suggestions
- Use local landmarks and references they would recognize`;

        const systemMessage = {
          role: 'system' as const,
          content: contextualPrompt
        };

        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: [
            systemMessage,
            ...[...messages, userMessage].map((msg, index, array) => ({
              role: msg.role,
              // Add search context only to the last message (current user message)
              content: index === array.length - 1
                ? enrichMessageWithDocuments(msg, searchContext)
                : enrichMessageWithDocuments(msg),
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
        const modelIndicator = (useStrategicMode || isAdvancedComplex)
          ? '\n\n*[VCB-AI Strategic Legal Analysis]*' // Show when using full legal framework
          : ''; // Clean UI for casual queries
        
        // Process content: sanitize -> normalize icons -> fix tables -> enforce formatting
        const processedContent = fixMarkdownTables(
          enforceFormatting(
            normalizeIcons(
              sanitizeMarkdown(rawContent + modelIndicator)
            )
          )
        );

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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
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

  const documentsById = useMemo(() => {
    if (conversationDocuments.length === 0) {
      return {};
    }
    const lookup: Record<string, StoredDocument | undefined> = {};
    conversationDocuments.forEach((doc) => {
      lookup[doc.id] = doc;
    });
    return lookup;
  }, [conversationDocuments]);

  const documentModalConversations = useMemo(() => {
    // Only compute when document manager is actually shown
    if (!showDocumentManager) {
      return [];
    }
    const stored = conversationManagerRef.current.getAllConversations();
    return stored.map((conv) => ({
      ...conv,
      documents: conv.id === currentConversationId ? conversationDocuments : (conv.documents ?? []),
    }));
  }, [conversationDocuments, currentConversationId, documentLibraryVersion, showDocumentManager]);

  const filteredDocumentConversations = useMemo(() => {
    if (documentModalConversations.length === 0) {
      return [];
    }
    const query = documentSearch.trim().toLowerCase();
    if (!query) {
      return documentModalConversations;
    }

    return documentModalConversations.filter((conv) => {
      const titleMatch = conv.title.toLowerCase().includes(query);
      const documentMatch = conv.documents.some((doc) => doc.name.toLowerCase().includes(query));
      return titleMatch || documentMatch;
    });
  }, [documentModalConversations, documentSearch]);

  const totalDocuments = useMemo(
    () => documentModalConversations.reduce((sum, conv) => sum + conv.documents.length, 0),
    [documentModalConversations],
  );

  const closeDocumentManager = useCallback(() => {
    setShowDocumentManager(false);
    setDocumentSearch('');
    setDocumentTargetConversationId(null);
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-env(safe-area-inset-top))] bg-white font-quicksand font-normal overflow-hidden" style={{fontWeight: 400}}>
      {/* CePO Animation - Black Monochrome Thinking */}
      {cepoProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="w-32 h-32 bg-vcb-black transform rotate-45 animate-pulse shadow-2xl border-4 border-vcb-mid-grey">
            <div className="w-full h-full flex items-center justify-center transform -rotate-45">
              <div className="text-center text-white">
                <span className="material-icons text-3xl animate-spin mb-1">
                  psychology
                </span>
                <div className="text-xs font-bold uppercase tracking-wide">
                  Thinking
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header - VCB Cleaner Theme per §5.1-5.3, Mobile Optimized */}
  <header className="bg-vcb-black border-b border-vcb-mid-grey px-3 py-0 md:px-8 md:py-0 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
            {/* GOGGA Logo on far left - restored original size and positioning */}
            <a
              href="https://vcb-ai.online"
              target="_blank"
              rel="noopener noreferrer"
              title="Visit VCB-AI"
              className="relative transition-opacity hover:opacity-80"
            >
              <img
                src={goggaSvgUrl}
                alt="GOGGA Logo"
                className="h-36 md:h-54 -rotate-[15deg] md:-rotate-[20deg] origin-center translate-y-8"
              />
            </a>
            <div className="flex flex-col ml-16 md:ml-24">
              <h1 className="text-xl md:text-3xl font-extrabold text-vcb-white tracking-wider">
                GOGGA (BETA)
              </h1>
              <p className="text-vcb-white text-[10px] md:text-[11px] font-medium uppercase tracking-wide">
                Powered by VCB-AI
              </p>
              <p className="text-vcb-white text-[9px] md:text-[10px] font-medium uppercase tracking-wide italic flex items-center gap-1">
                <span className="material-icons text-[9px] md:text-sm">auto_awesome</span>
                Now with CePO <span className="text-[#4169E1] font-bold">[Cognitive Execution Pipeline]</span>
              </p>
            </div>
          </div>
          <div className="flex-1 flex justify-end items-center gap-2 md:gap-4">
            {/* Row 1: History and Timer */}
            <div className="flex flex-wrap gap-2 justify-start md:justify-end">
              {/* Chat History Button */}
              <button
                type="button"
                onClick={() => setShowChatHistory(!showChatHistory)}
                className="flex items-center justify-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors flex-1 min-w-[7rem] md:flex-none md:w-32"
                title="Chat History"
              >
                <span className="material-icons text-base md:text-lg">history</span>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">History</span>
              </button>

              {/* Document Library Button */}
              <button
                type="button"
                onClick={() => {
                  setDocumentSearch('');
                  setShowDocumentManager(true);
                }}
                className="flex items-center justify-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors flex-1 min-w-[7rem] md:flex-none md:w-32"
                title="Document Library"
              >
                <span className="material-icons text-base md:text-lg">folder</span>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">Docs</span>
              </button>

              {/* Session Timer */}
              <div className="flex items-center justify-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white flex-1 min-w-[7rem] md:flex-none md:w-32">
                <span className="material-icons text-base md:text-lg">schedule</span>
                <span className="text-[10px] md:text-xs font-mono font-medium tracking-wide">
                  {formatSessionTime(sessionTime)}
                </span>
              </div>
            </div>

            {/* Row 2: Usage, Voice Gender, and Create Image */}
            <div className="flex flex-wrap gap-2 justify-start md:justify-end">
              {/* Usage Stats Button */}
              <button
                type="button"
                onClick={() => setShowUsage(!showUsage)}
                className="flex items-center justify-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-mid-grey bg-vcb-black text-vcb-white hover:border-vcb-white transition-colors flex-1 min-w-[7rem] md:flex-none md:w-32"
                title="View Usage & Pricing"
              >
                <span className="material-icons text-base md:text-lg">analytics</span>
                <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wide">Usage</span>
              </button>

              {/* Voice Gender Toggle Button */}
              <button
                type="button"
                onClick={toggleVoiceGender}
                className="flex items-center justify-center space-x-1 px-2 py-1.5 md:px-3 md:py-2 border border-vcb-accent bg-vcb-black text-vcb-accent hover:bg-vcb-accent hover:text-vcb-black transition-colors flex-1 min-w-[7rem] md:flex-none md:w-32"
                title={`Switch to ${voiceGender === 'female' ? 'Male' : 'Female'} Voice`}
              >
                <span className="material-icons text-base md:text-lg">
                  {voiceGender === 'female' ? 'person' : 'person_outline'}
                </span>
                <span className="hidden md:inline text-white text-[10px] font-medium uppercase tracking-wide">
                  {voiceGender === 'female' ? 'Female Voice' : 'Male Voice'}
                </span>
              </button>

            </div>
          </div>
        </div>
      </header>

      {/* Toast Notifications - Fixed position below header */}
      {(uploadFeedback || uploadError) && (
        <div className="fixed top-24 right-4 z-50 animate-slide-in-right">
          <div
            className={`flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg border-2 ${
              uploadError
                ? 'bg-red-50 border-red-500 text-red-700'
                : 'bg-green-50 border-green-500 text-green-700'
            }`}
          >
            <span className="material-icons text-xl">
              {uploadError ? 'error_outline' : 'check_circle'}
            </span>
            <span className="text-sm font-medium">{uploadError ?? uploadFeedback}</span>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocument && (
        <div className="fixed inset-0 bg-vcb-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={() => setPreviewDocument(null)}>
          <div className="bg-white border-2 border-vcb-accent max-w-4xl w-full max-h-[90vh] flex flex-col rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-vcb-black border-b-2 border-vcb-accent px-6 py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-vcb-white font-bold text-lg uppercase tracking-wide truncate">
                  {previewDocument?.name || 'Document'}
                </h2>
                <p className="text-vcb-mid-grey text-sm mt-1">
                  {previewDocument?.type || 'Unknown'} • {((previewDocument?.size || 0) / 1024).toFixed(1)} KB • {(previewDocument?.text?.length || 0).toLocaleString()} characters
                </p>
              </div>
              <button
                onClick={() => setPreviewDocument(null)}
                className="ml-4 text-vcb-white hover:text-vcb-accent transition-colors"
                title="Close preview"
              >
                <span className="material-icons text-3xl">close</span>
              </button>
            </div>

            {/* Document Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="bg-white border border-vcb-light-grey rounded-lg p-4 shadow-sm">
                <div className="mb-3 pb-3 border-b border-vcb-light-grey">
                  <h3 className="text-vcb-black font-semibold text-sm uppercase tracking-wide">
                    Extracted Text Preview
                  </h3>
                  <p className="text-vcb-mid-grey text-xs mt-1">
                    This is what the AI will receive when you attach this document to a message
                  </p>
                </div>
                <pre className="text-vcb-black text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
                  {previewDocument?.text ? previewDocument.text.replace(/[<>&"']/g, (char) => {
                    const entities: Record<string, string> = {
                      '<': '<',
                      '>': '>',
                      '&': '&',
                      '"': '"',
                      "'": "'"
                    };
                    return entities[char] || char;
                  }) : 'No content available'}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-vcb-black border-t-2 border-vcb-accent px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-vcb-mid-grey text-xs">
                <span className="material-icons text-sm">info</span>
                <span>Uploaded: {new Date(previewDocument?.uploadedAt || Date.now()).toLocaleString()}</span>
              </div>
              <button
                onClick={() => setPreviewDocument(null)}
                className="px-4 py-2 bg-vcb-accent hover:bg-yellow-500 text-vcb-black font-bold uppercase tracking-wide text-sm transition-colors rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Generator Modal - Floating */}
      {showImagePrompt && (
        <div className="fixed inset-0 bg-vcb-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={() => setShowImagePrompt(false)}>
          <div className="bg-gradient-to-r from-vcb-black to-vcb-dark-grey border-2 border-vcb-accent max-w-2xl w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-vcb-black border-b-2 border-vcb-accent px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="material-icons text-vcb-accent text-2xl">image</span>
                <h2 className="text-vcb-white font-bold text-lg uppercase tracking-wide">
                  Gogga Image Generator
                </h2>
              </div>
              <button
                onClick={() => setShowImagePrompt(false)}
                className="ml-4 text-vcb-white hover:text-vcb-accent transition-colors"
                title="Close"
              >
                <span className="material-icons text-3xl">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <p className="text-white text-sm mb-4 font-medium">Powered by Gogga</p>
              <div className="relative mb-4">
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
                  placeholder="A vibrant South African sunset over Table Mountain with wildlife in the foreground"
                  className="w-full bg-vcb-white text-vcb-black border-2 border-vcb-mid-grey focus:border-vcb-accent px-4 py-3 text-base rounded-lg focus:outline-none transition-colors placeholder:text-vcb-mid-grey"
                  disabled={isGeneratingImage}
                />
              </div>
              <button
                onClick={handleGenerateImage}
                disabled={!imagePrompt.trim() || isGeneratingImage}
                className="w-full bg-vcb-accent hover:bg-yellow-500 disabled:bg-vcb-mid-grey disabled:cursor-not-allowed text-vcb-black px-6 py-3 text-base font-bold uppercase tracking-wider transition-all duration-200 rounded-lg shadow-md hover:shadow-xl disabled:shadow-none flex items-center justify-center space-x-2"
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
          </div>
        </div>
      )}

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
                  <span className="material-icons text-2xl">close</span>
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
                      <span className="material-icons text-6xl mx-auto mb-4 opacity-50 block">chat_bubble_outline</span>
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
                                  <span className="material-icons text-base text-vcb-mid-grey">push_pin</span>
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
                                <span className="material-icons text-base">push_pin</span>
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
                                <span className="material-icons text-base">edit</span>
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
                                <span className="material-icons text-base">download</span>
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
                                <span className="material-icons text-base">delete</span>
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

      {showDocumentManager && (
        <div
          className="fixed inset-0 bg-vcb-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={closeDocumentManager}
        >
          <div
            className="bg-white border border-vcb-light-grey max-w-5xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-vcb-black border-b border-vcb-mid-grey px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-icons text-vcb-accent text-3xl">folder_open</span>
                <div>
                  <h2 className="text-lg font-bold text-vcb-white uppercase tracking-wider">Document Library</h2>
                  <p className="text-[10px] text-vcb-mid-grey uppercase tracking-wide">
                    {totalDocuments} {totalDocuments === 1 ? 'document' : 'documents'} across {documentModalConversations.length}{' '}
                    {documentModalConversations.length === 1 ? 'chat' : 'chats'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeDocumentManager}
                className="text-vcb-white hover:text-vcb-light-grey transition-colors"
                title="Close"
              >
                <span className="material-icons text-2xl">close</span>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center w-full md:max-w-sm gap-2">
                  <input
                    type="text"
                    value={documentSearch}
                    onChange={(e) => setDocumentSearch(e.target.value)}
                    placeholder="Search chats or documents..."
                    className="flex-1 bg-white text-vcb-black border border-vcb-mid-grey px-3 py-2 text-sm focus:outline-none focus:border-vcb-black"
                  />
                  {documentSearch && (
                    <button
                      onClick={() => setDocumentSearch('')}
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide border border-vcb-mid-grey text-vcb-mid-grey hover:border-vcb-black hover:text-vcb-black transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="text-[10px] md:text-xs text-vcb-mid-grey uppercase tracking-wide">
                  Attached to current chat: {conversationDocuments.length}
                </div>
              </div>

              {documentModalConversations.length === 0 ? (
                <div className="text-center py-16 text-vcb-mid-grey border border-dashed border-vcb-light-grey">
                  <span className="material-icons text-5xl mx-auto mb-3 block">description</span>
                  <p className="text-sm uppercase font-medium">No documents stored yet</p>
                  <p className="text-xs mt-1">Upload a document from the chat toolbar to see it here.</p>
                </div>
              ) : filteredDocumentConversations.length === 0 ? (
                <div className="text-center py-12 text-vcb-mid-grey border border-dashed border-vcb-light-grey">
                  <p className="text-sm uppercase font-medium">No matches</p>
                  <p className="text-xs mt-1">Try a different search for chat titles or document names.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDocumentConversations.map((conv, convIndex) => {
                    const isCurrent = conv.id === currentConversationId;
                    const docCount = conv.documents.length;
                    return (
                      <div
                        key={conv.id}
                        className="border border-vcb-light-grey bg-white px-4 py-4 md:px-6 md:py-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wide text-vcb-mid-grey">
                                Chat {convIndex + 1}
                              </span>
                              <h3 className="text-sm md:text-base font-semibold text-vcb-black line-clamp-1">
                                {conv.title}
                              </h3>
                            </div>
                            <p className="text-[9px] md:text-[10px] text-vcb-mid-grey mt-1">
                              {docCount} {docCount === 1 ? 'document' : 'documents'} · Updated {new Date(conv.updatedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setDocumentTargetConversationId(conv.id);
                                fileInputRef.current?.click();
                              }}
                              className="px-3 py-2 text-[10px] md:text-xs font-medium uppercase tracking-wide border border-vcb-mid-grey text-vcb-black hover:bg-vcb-black hover:text-vcb-white transition-colors"
                            >
                              Upload
                            </button>
                            {!isCurrent && (
                              <button
                                onClick={() => {
                                  loadConversation(conv.id);
                                  closeDocumentManager();
                                }}
                                className="px-3 py-2 text-[10px] md:text-xs font-medium uppercase tracking-wide border border-vcb-mid-grey text-vcb-mid-grey hover:border-vcb-black hover:text-vcb-black transition-colors"
                              >
                                Open Chat
                              </button>
                            )}
                          </div>
                        </div>

                        <ul className="mt-3 space-y-2">
                          {docCount === 0 ? (
                            <li className="text-[9px] md:text-[10px] text-vcb-mid-grey italic">
                              No documents uploaded yet.
                            </li>
                          ) : (
                            conv.documents.map((doc, docIndex) => {
                              const isAttached = isCurrent && pendingAttachmentIds.includes(doc.id);
                              return (
                                <li
                                  key={doc.id}
                                  className="bg-white border border-vcb-light-grey rounded px-3 py-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                                >
                                  <div className="min-w-0">
                                    <p className="text-[10px] md:text-xs font-semibold text-vcb-black truncate" title={doc.name}>
                                      {docIndex + 1}. {doc.name}
                                    </p>
                                    <p className="text-[9px] md:text-[10px] text-vcb-mid-grey">
                                      Added {new Date(doc.uploadedAt).toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 md:gap-3">
                                    {isAttached && (
                                      <span className="px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-green-600 border border-green-300 rounded-full">
                                        Attached
                                      </span>
                                    )}
                                    {isCurrent && (
                                      <button
                                        onClick={() => {
                                          handleInsertDocument(doc.id);
                                          closeDocumentManager();
                                        }}
                                        className="px-2 py-1 text-[9px] md:text-[10px] font-medium text-vcb-black border border-vcb-mid-grey rounded hover:bg-vcb-mid-grey hover:text-white transition-colors"
                                        title="Attach to next message - AI will receive full document"
                                      >
                                        Attach
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleRemoveDocument(doc.id, conv.id)}
                                      className="px-2 py-1 text-[9px] md:text-[10px] text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
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
                <span className="material-icons text-2xl">close</span>
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

      {/* Weather Widget - Positioned on the right side of the screen */}
      {!isMobile && userLocation?.city && (
        <div className="fixed bottom-20 right-4 z-20 w-64">
          <WeatherWidget location={userLocation.city} />
        </div>
      )}

      {/* Messages Container - 80%+ whitespace per §5.1, Mobile Optimized */}
      <div className="flex-1 overflow-y-auto px-2 py-1 md:px-8 md:py-2 min-h-0">
        
        <div className="max-w-5xl mx-auto space-y-2 md:space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-vcb-mid-grey py-8 md:py-24">
              <span className="material-icons text-6xl md:text-8xl mb-4 md:mb-8 block -translate-y-2 md:translate-y-2 -rotate-[20deg] md:-rotate-[35deg] origin-top md:drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]">chat_bubble_outline</span>
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
                documentsById={documentsById}
              />
            ))
          )}

          {/* Search Progress Indicator - Only show while actively searching */}
          {(isSearching || progressiveSearch.isSearching) && (
            <div className="flex justify-start mt-4">
              <div className="max-w-3xl border-2 border-vcb-accent bg-white rounded-lg px-4 py-3 shadow-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src="gogga.svg"
                    alt="GOGGA"
                    className="w-6 h-6 animate-bounce"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-vcb-black">
                        {searchProgress || 'GOGGA is searching...'}
                      </span>
                      <span className="material-icons text-vcb-accent animate-spin text-lg">search</span>
                    </div>
                    {userLocation?.city && (
                      <div className="flex items-center space-x-1 mt-1">
                        <span className="material-icons text-green-600 text-xs">location_on</span>
                        <span className="text-xs text-green-600 font-medium">Using your location: {userLocation.city}</span>
                      </div>
                    )}
                  </div>
                  {progressiveSearch.isSearching && progressiveSearch.progress > 0 && (
                    <div className="text-xs font-bold text-vcb-accent">
                      {progressiveSearch.progress}%
                    </div>
                  )}
                </div>
              </div>
            </div>
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

          {/* Local Places Results - Coffee Shops, Restaurants, etc. */}
          {localPlaces.length > 0 && !isLoading && !isSearching && (
            <div className="flex justify-start mt-4 animate-fade-in">
              <div className="max-w-4xl w-full border-2 border-vcb-accent bg-white rounded-lg overflow-hidden shadow-lg">
                <div className="bg-vcb-black px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="material-icons text-vcb-accent text-xl">place</span>
                    <h3 className="text-white font-bold uppercase text-sm">
                      Local Places in Your Area
                    </h3>
                  </div>
                  <span className="text-vcb-accent text-xs font-bold">{localPlaces.length} Found</span>
                </div>
                
                {/* Map Image */}
                {mapImage && (
                  <div className="relative w-full h-56 bg-gray-100 border-b-2 border-vcb-light-grey">
                    <img 
                      src={mapImage} 
                      alt="Location Map" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-vcb-black bg-opacity-80 px-2 py-1 rounded">
                      <span className="text-white text-xs font-bold flex items-center space-x-1">
                        <span className="material-icons text-sm">map</span>
                        <span>Google Maps</span>
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Places Grid */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto">
                  {localPlaces.map((place, index) => (
                    <div key={index} className="bg-white border-2 border-vcb-light-grey rounded-lg p-4 hover:border-vcb-accent hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="bg-vcb-accent text-vcb-black text-xs font-bold px-2 py-0.5 rounded">
                              #{index + 1}
                            </span>
                            <span className="text-xs text-vcb-mid-grey uppercase">{place.type}</span>
                          </div>
                          <h4 className="text-base font-bold text-vcb-black" title={place.title}>
                            {place.title}
                          </h4>
                        </div>
                      </div>
                      
                      {/* Rating & Reviews */}
                      {place.rating && (
                        <div className="flex items-center space-x-3 mb-3 pb-3 border-b border-vcb-light-grey">
                          <div className="flex items-center space-x-1 bg-yellow-50 px-2 py-1 rounded">
                            <span className="material-icons text-yellow-500 text-base">star</span>
                            <span className="text-sm font-bold text-vcb-black">{place.rating}</span>
                          </div>
                          {place.reviews && (
                            <span className="text-xs text-vcb-mid-grey font-medium">({place.reviews.toLocaleString()} reviews)</span>
                          )}
                          {place.price && (
                            <span className="text-sm font-bold text-green-600">{place.price}</span>
                          )}
                        </div>
                      )}
                      
                      {/* Address */}
                      {place.address && (
                        <div className="flex items-start space-x-2 mb-3">
                          <span className="material-icons text-vcb-accent text-base mt-0.5 flex-shrink-0">location_on</span>
                          <p className="text-xs text-vcb-black leading-relaxed">{place.address}</p>
                        </div>
                      )}
                      
                      {/* Description */}
                      {place.description && (
                        <div className="bg-gray-50 border-l-4 border-vcb-accent px-3 py-2 mb-3">
                          <p className="text-xs text-vcb-black italic leading-relaxed">
                            "{place.description}"
                          </p>
                        </div>
                      )}
                      
                      {/* Thumbnail */}
                      {place.thumbnail && (
                        <div className="relative overflow-hidden rounded-lg mt-3">
                          <img 
                            src={place.thumbnail} 
                            alt={place.title}
                            className="w-full h-32 object-cover hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="bg-vcb-black px-4 py-3 border-t-2 border-vcb-accent">
                  <p className="text-xs text-vcb-white flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <span className="material-icons text-sm text-vcb-accent">verified</span>
                      <span>Powered by Google Maps & SerpAPI</span>
                    </span>
                    <span className="text-vcb-accent font-bold">Real-time data</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Google Search Results Display - After Gogga's response */}
          {searchResults.length > 0 && !isLoading && (
            <div className="flex justify-start mt-4">
              <div className="max-w-3xl w-full border-2 border-vcb-black bg-gray-50 rounded-lg overflow-hidden">
                <div className="bg-vcb-black px-4 py-2 flex items-center space-x-2">
                  <span className="material-icons text-white">search</span>
                  <h3 className="text-white font-bold uppercase text-sm">
                    Gogga Search Results for: {googleSearchQuery}
                  </h3>
                </div>
                <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <div key={index} className="bg-white border border-vcb-light-grey rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <span className="text-vcb-mid-grey font-bold text-xs mt-0.5">{index + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <a
                            href={result.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline block truncate"
                            title={result.title}
                          >
                            {result.title}
                          </a>
                          <p className="text-xs text-green-700 truncate mt-0.5">{result.displayLink}</p>
                          <p className="text-xs text-vcb-black mt-2 leading-relaxed">{result.snippet}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-100 px-4 py-2 border-t border-vcb-light-grey">
                  <p className="text-xs text-vcb-mid-grey flex items-center space-x-1">
                    <span className="material-icons text-sm">info</span>
                    <span>These search results were provided to Gogga for context</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Container - high contrast per §5.1, Mobile Optimized */}
      <div
        className="relative border-t border-vcb-light-grey bg-white px-3 pt-0 pb-16 md:px-5 md:pt-0.5 md:pb-16 overflow-visible transform translate-y-2 md:translate-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }}
      >
        <div className="relative max-w-5xl mx-auto">
          <img
            src="Sovereign-Chat-icon-Spin.svg"
            alt="Animated GOGGA"
            className="hidden md:block absolute -top-14 left-0 h-48 w-48 pointer-events-none md:translate-y-4"
          />
          <form onSubmit={handleSubmit} className="space-y-0 md:space-y-0 md:pl-40 md:pb-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleDocumentUpload}
          />
          {voiceModeEnabled && isListening && (
            <div className="mb-1 md:mb-3 flex items-center justify-center space-x-2 text-vcb-mid-grey">
              <span className="material-icons text-sm md:text-base animate-pulse">mic</span>
              <span className="text-[10px] md:text-sm font-medium uppercase">Listening...</span>
              </div>
          )}

            <div className="w-full md:pt-0 relative">
              {/* Floating Document list - positioned above chat input */}
              {conversationDocuments.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 border-2 border-vcb-accent bg-white rounded-lg p-2 shadow-lg z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] md:text-xs font-bold text-vcb-black uppercase tracking-wide">
                      Attached Documents
                    </span>
                    <span className="text-[10px] md:text-xs font-semibold text-vcb-accent">
                      {conversationDocuments.length}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                    {conversationDocuments.map((doc, index) => {
                      const isAttached = pendingAttachmentIds.includes(doc.id);
                      return (
                        <li
                          key={doc.id}
                          className={`flex items-center justify-between rounded px-2 py-1 border-2 transition-all ${
                            isAttached
                              ? 'bg-green-50 border-green-500'
                              : 'bg-gray-50 border-vcb-light-grey'
                          }`}
                        >
                          <div className="flex-1 min-w-0 flex items-center space-x-2">
                            <button
                              onClick={() => setPreviewDocument(doc)}
                              className="flex-shrink-0 p-1 hover:bg-vcb-accent rounded transition-colors"
                              title="Preview extracted text"
                            >
                              <span className="material-icons text-vcb-mid-grey hover:text-vcb-black text-sm">
                                visibility
                              </span>
                            </button>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[10px] md:text-xs font-semibold text-vcb-black truncate"
                                title={doc.name}
                              >
                                {index + 1}. {doc.name}
                              </p>
                              <p className="text-[9px] md:text-[10px] text-vcb-mid-grey truncate">
                                {new Date(doc.uploadedAt).toLocaleString()} • {(doc.text.length / 1000).toFixed(1)}k chars
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            {isAttached && (
                              <span className="material-icons text-green-600 text-sm">check_circle</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(doc.id)}
                              className="px-2 py-1 text-[9px] md:text-[10px] text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                              title="Remove from this chat"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <textarea
                id="chat-input"
                name="message"
                ref={inputRef}
                value={secureInput.value}
                onChange={(e) => secureInput.validateAndSet(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voiceModeEnabled ? "Speak your message..." : "Type your message..."}
                className="w-full bg-white text-vcb-black border border-vcb-light-grey px-3 py-1.5 md:px-5 md:py-1.5 text-sm md:text-base focus:outline-none focus:border-vcb-mid-grey resize-none font-normal leading-relaxed min-h-[2.75rem] rounded-lg shadow-sm"
                rows={isMobile ? 3 : 1}
                disabled={isLoading}
              />
            </div>
            {/* Mobile: Enhanced quick actions grid */}
            <div className="md:hidden grid grid-cols-7 gap-1 w-full -mt-2">
              <button
                type="button"
                onClick={() => setForceThinkingMode(!forceThinkingMode)}
                disabled={isLoading || useCePO}
                className={`h-8 transition-colors duration-200 border flex items-center justify-center rounded-md ${
                  forceThinkingMode
                    ? 'bg-[#DC143C] text-white border-[#DC143C]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={forceThinkingMode ? 'Thinking Mode ON (Qwen)' : 'Thinking Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-base">psychology</span>
              </button>
              <button
                type="button"
                onClick={() => setUseCePO(!useCePO)}
                disabled={isLoading || forceThinkingMode}
                className={`h-8 transition-colors duration-200 border flex items-center justify-center rounded-md ${
                  useCePO
                    ? 'bg-[#4169E1] text-white border-[#4169E1]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={useCePO ? 'CePO Mode ON (Advanced Reasoning)' : 'CePO Mode OFF (Click to enable)'}
              >
                <span className="material-icons text-base">auto_awesome</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImagePrompt(!showImagePrompt)}
                disabled={isLoading || isGeneratingImage}
                className={`h-8 transition-colors duration-200 border flex items-center justify-center rounded-md ${
                  showImagePrompt
                    ? 'bg-[#28a745] text-white border-[#28a745]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Generate Image with Gogga"
              >
                <span className="material-icons text-base">image</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentTargetConversationId(currentConversationId);
                  fileInputRef.current?.click();
                }}
                disabled={isLoading || isProcessingUpload}
                className={`h-8 transition-colors duration-200 border flex items-center justify-center rounded-md ${
                  isProcessingUpload
                    ? 'bg-white text-vcb-mid-grey border-vcb-light-grey'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Attach document"
              >
                <span className={`material-icons text-base ${isProcessingUpload ? 'animate-spin' : ''}`}>
                  {isProcessingUpload ? 'autorenew' : 'attach_file'}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleVoiceMode}
                disabled={true}
                className="h-8 transition-colors duration-200 border flex items-center justify-center rounded-md bg-vcb-light-grey text-vcb-mid-grey border-vcb-light-grey opacity-50 cursor-not-allowed"
                title="Voice Mode (Disabled)"
              >
                <span className="material-icons text-base">
                  mic_off
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSearchEnabled(!searchEnabled)}
                disabled={isLoading}
                className={`h-8 transition-colors duration-200 border flex items-center justify-center rounded-md ${
                  searchEnabled
                    ? 'bg-vcb-black text-white border-vcb-black'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={searchEnabled ? 'Gogga Search ON - Will search before responding' : 'Gogga Search OFF - Click to enable'}
              >
                <span className="material-icons text-base">search</span>
              </button>
              <button
                type="submit"
                disabled={isLoading || !secureInput.value.trim()}
                className="h-8 bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white font-medium transition-colors duration-200 flex items-center justify-center border border-vcb-mid-grey rounded-md"
              >
                {isLoading ? (
                  <img
                    src="sovereign-thinking-spinner.svg"
                    alt="Sending..."
                    className="h-4 w-4"
                  />
                ) : (
                  <span className="material-icons text-base">send</span>
                )}
              </button>
            </div>
            {/* Desktop: Horizontal button layout */}
            <div className="hidden md:flex md:items-center md:space-x-4 md:-mt-4 md:-mb-4">
              <button
                type="button"
                onClick={() => setForceThinkingMode(!forceThinkingMode)}
                disabled={isLoading || useCePO}
                className={`px-4 h-12 transition-colors duration-200 border flex items-center justify-center ${
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
                className={`px-4 h-12 transition-colors duration-200 border flex items-center justify-center ${
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
                className={`px-4 h-12 transition-colors duration-200 border flex items-center justify-center ${
                  showImagePrompt
                    ? 'bg-[#28a745] text-white border-[#28a745]'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Generate Image with Gogga"
              >
                <span className="material-icons text-2xl">image</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentTargetConversationId(currentConversationId);
                  fileInputRef.current?.click();
                }}
                disabled={isLoading || isProcessingUpload}
                className={`px-4 h-12 transition-colors duration-200 border flex items-center justify-center ${
                  isProcessingUpload
                    ? 'bg-white text-vcb-mid-grey border-vcb-light-grey'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Attach document"
              >
                <span className={`material-icons text-2xl ${isProcessingUpload ? 'animate-spin' : ''}`}>
                  {isProcessingUpload ? 'autorenew' : 'attach_file'}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleVoiceMode}
                disabled={true}
                className="px-4 h-12 transition-colors duration-200 border flex items-center justify-center bg-vcb-light-grey text-vcb-mid-grey border-vcb-light-grey opacity-50 cursor-not-allowed"
                title="Voice Mode (Disabled)"
              >
                <span className="material-icons text-2xl">
                  mic_off
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSearchEnabled(!searchEnabled)}
                disabled={isLoading}
                className={`px-4 h-12 transition-colors duration-200 border flex items-center justify-center ${
                  searchEnabled
                    ? 'bg-vcb-black text-white border-vcb-black'
                    : 'bg-white text-vcb-mid-grey border-vcb-light-grey hover:bg-vcb-light-grey hover:text-vcb-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={searchEnabled ? 'Gogga Search ON - Will search before responding' : 'Gogga Search OFF - Click to enable'}
                onDoubleClick={() => setShowSearchStats(true)}
              >
                <span className="material-icons text-2xl">search</span>
              </button>
              <button
                type="submit"
                disabled={isLoading || !secureInput.value.trim()}
                className="bg-vcb-black hover:bg-vcb-dark-grey disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-white px-7 h-12 text-sm font-medium uppercase tracking-wider transition-colors duration-200 flex items-center space-x-3 border border-vcb-mid-grey"
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
          </form>
        </div>

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
      
      {/* Search Stats Modal */}
      <SearchStats 
        isVisible={showSearchStats} 
        onClose={() => setShowSearchStats(false)} 
      />

      {/* Location Permission Prompt */}
      {showLocationPrompt && (
        <div className="fixed top-32 left-0 right-0 z-50 flex justify-center p-4" onClick={() => setShowLocationPrompt(false)}>
          <div className="bg-white border-2 border-vcb-accent max-w-md w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-vcb-black px-6 py-4 flex items-center space-x-3 border-b-2 border-vcb-accent">
              <img src="gogga.svg" alt="GOGGA" className="w-8 h-8" />
              <h2 className="text-white font-bold text-lg uppercase tracking-wide">GOGGA Needs Your Location</h2>
            </div>
            <div className="p-6">
              <div className="flex items-start space-x-3 mb-4">
                <span className="material-icons text-vcb-accent text-3xl">location_on</span>
                <div>
                  <p className="text-vcb-black font-medium mb-2">
                    GOGGA wants to help you find the best local results!
                  </p>
                  <p className="text-sm text-vcb-mid-grey leading-relaxed">
                    By sharing your location, GOGGA can:
                  </p>
                  <ul className="text-sm text-vcb-mid-grey mt-2 space-y-1 ml-4">
                    <li>• Find nearby coffee shops, restaurants & services</li>
                    <li>• Show accurate distances and directions</li>
                    <li>• Provide location-specific recommendations</li>
                    <li>• Display real-time local business information</li>
                  </ul>
                  <p className="text-xs text-vcb-mid-grey mt-3 italic">
                    Your location is only used for search and never stored or shared.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      requestLocation();
                    }}
                    className="flex-1 bg-vcb-accent hover:bg-yellow-500 text-vcb-black px-4 py-3 font-bold uppercase tracking-wide text-sm transition-colors rounded flex items-center justify-center space-x-2"
                  >
                    <span className="material-icons">my_location</span>
                    <span>Use GPS</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowLocationPrompt(false);
                      setShowManualLocation(true);
                    }}
                    className="flex-1 bg-white border-2 border-vcb-accent hover:bg-vcb-accent hover:text-vcb-black text-vcb-black px-4 py-3 font-bold uppercase tracking-wide text-sm transition-colors rounded flex items-center justify-center space-x-2"
                  >
                    <span className="material-icons">edit_location</span>
                    <span>Enter Manually</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowLocationPrompt(false)}
                  className="w-full bg-white border border-vcb-mid-grey hover:border-vcb-black text-vcb-mid-grey hover:text-vcb-black px-4 py-2 font-medium uppercase tracking-wide text-xs transition-colors rounded"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Location Input Modal */}
      {showManualLocation && (
        <div className="fixed inset-0 bg-vcb-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={() => setShowManualLocation(false)}>
          <div className="bg-white border-2 border-vcb-accent max-w-md w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-vcb-black px-6 py-4 flex items-center justify-between border-b-2 border-vcb-accent">
              <div className="flex items-center space-x-3">
                <span className="material-icons text-vcb-accent text-2xl">edit_location</span>
                <h2 className="text-white font-bold text-lg uppercase tracking-wide">Enter Your Location</h2>
              </div>
              <button onClick={() => setShowManualLocation(false)} className="text-white hover:text-vcb-accent transition-colors">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-vcb-mid-grey mb-4">
                Enter your city, street address, or area name:
              </p>
              <input
                type="text"
                value={manualLocationInput}
                onChange={(e) => setManualLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setManualLocation(manualLocationInput);
                  }
                }}
                placeholder="e.g., Pretoria, Garsfontein, or Main Street"
                className="w-full px-4 py-3 border-2 border-vcb-light-grey focus:border-vcb-accent rounded text-vcb-black placeholder-vcb-mid-grey focus:outline-none"
                autoFocus
              />
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={() => setManualLocation(manualLocationInput)}
                  disabled={!manualLocationInput.trim()}
                  className="flex-1 bg-vcb-accent hover:bg-yellow-500 disabled:bg-vcb-light-grey disabled:cursor-not-allowed text-vcb-black px-4 py-3 font-bold uppercase tracking-wide text-sm transition-colors rounded flex items-center justify-center space-x-2"
                >
                  <span className="material-icons">check</span>
                  <span>Set Location</span>
                </button>
                <button
                  onClick={() => {
                    setShowManualLocation(false);
                    setShowLocationPrompt(true);
                  }}
                  className="px-4 py-3 border-2 border-vcb-mid-grey hover:border-vcb-black text-vcb-black font-medium uppercase tracking-wide text-sm transition-colors rounded"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Footer - Fixed at bottom of screen */}
        <footer className="fixed bottom-0 left-0 right-0 bg-vcb-black border-t border-vcb-mid-grey px-4 py-2 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-vcb-white">
            <div className="flex items-center space-x-4 text-xs">
              <span>© 2025 VCB-AI (Pty) Ltd</span>
              <span>•</span>
              <span>GOGGA Beta</span>
            </div>
            <div className="flex items-center space-x-4 text-xs">
              {userLocation?.street ? (
                <button
                  onClick={() => setShowLocationPrompt(true)}
                  className="flex items-center space-x-1 text-green-400 hover:text-green-300 transition-colors"
                  title="Click to change location"
                >
                  <span className="material-icons text-xs">{userLocation.isManual ? 'edit_location' : 'location_on'}</span>
                  <span>{userLocation.street}, {userLocation.city || 'SA'}</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowLocationPrompt(true)}
                  className="flex items-center space-x-1 text-vcb-mid-grey hover:text-vcb-accent transition-colors"
                  title="Set your location for better search results"
                >
                  <span className="material-icons text-xs">location_off</span>
                  <span>Set Location</span>
                </button>
              )}
              <span>•</span>
              <a href="https://vcb-ai.online" target="_blank" rel="noopener noreferrer" className="hover:text-vcb-accent transition-colors">
                vcb-ai.online
              </a>
            </div>
          </div>
        </footer>
    </div>
    </ErrorBoundary>
  );
};

export default App;
