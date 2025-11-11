export const enforceFormatting = (text: string): string => {
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
  invalidIcons.forEach((invalid) => {
    const regex = new RegExp(`\\[${invalid}\\]`, 'gi');
    fixed = fixed.replace(regex, '');
  });

  // Fix broken search links that appear as [search] in text
  fixed = fixed.replace(/\\[search\\]/gi, 'search');

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
  iconNames.forEach((iconName) => {
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
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
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
export const normalizeIcons = (text: string): string => {
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
export const fixMarkdownTables = (text: string): string => {
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

export const extractThinkingBlock = (content: string): { thinking: string | null; answer: string } => {
  if (!content) {
    return { thinking: null, answer: '' };
  }

  const fullThinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const altThinkingMatch = fullThinkingMatch ?? content.match(/<think>([\s\S]*?)<\/think>/i);

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