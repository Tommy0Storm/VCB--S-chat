// SA Language Detection - Based on Kasanoma patterns
// Supports all 11 official SA languages

export interface LanguageDetection {
  language: string; // Human-readable language name (e.g., "Afrikaans")
  code: string;     // ISO-like language code (e.g., "af")
  confidence: number;
  greeting?: string;
}

const toLanguageName = (languageKey: string): string => {
  return languageKey
    .split(/[_\s-]+/)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

// Language patterns for detection
const SA_LANGUAGE_PATTERNS = {
  afrikaans: {
    code: 'af',
    patterns: [
      /\b(hallo|goeie|dankie|asseblief|baie|lekker|jy|ek|is|die|van|en|wat|hoe|waar|wanneer)\b/gi,
      /\b(howzit|ag|man|boet|sus|toeiens|sien|jou|later)\b/gi
    ],
    greetings: ['Hallo!', 'Goeie dag!', 'Howzit!']
  },
  english: {
    code: 'en',
    patterns: [
      /\b(hello|good|thank|please|very|nice|you|i|am|the|of|and|what|how|where|when)\b/gi,
      /\b(howzit|hey|hi|thanks|cheers|mate)\b/gi
    ],
    greetings: ['Hello!', 'Good day!', 'Howzit!']
  },
  zulu: {
    code: 'zu',
    patterns: [
      /\b(sawubona|ngiyabonga|ngicela|kuhle|wena|mina|ngi|ku|e|la|na|ukuthi|kanjani|kuphi|nini)\b/gi,
      /\b(yebo|cha|hhayi|eish|heyi)\b/gi
    ],
    greetings: ['Sawubona!', 'Sanibonani!', 'Yebo!']
  },
  xhosa: {
    code: 'xh',
    patterns: [
      /\b(molo|enkosi|nceda|mnandi|wena|mna|ndi|ku|e|la|na|ukuba|njani|phi|nini)\b/gi,
      /\b(ewe|hayi|yho|tyhini)\b/gi
    ],
    greetings: ['Molo!', 'Molweni!', 'Ewe!']
  },
  sepedi: {
    code: 'nso',
    patterns: [
      /\b(dumela|ke|leboga|hle|wena|nna|ke|go|e|la|gore|bjang|kae|neng)\b/gi,
      /\b(ee|aowa|hela|yah)\b/gi
    ],
    greetings: ['Dumela!', 'Thobela!', 'Ee!']
  },
  setswana: {
    code: 'tn',
    patterns: [
      /\b(dumela|ke|leboga|tsweetswee|botoka|wena|nna|ke|go|e|la|gore|jang|kae|leng)\b/gi,
      /\b(ee|nnyaa|hela|rra|mma)\b/gi
    ],
    greetings: ['Dumela!', 'Dumelang!', 'Ee rra!']
  },
  sesotho: {
    code: 'st',
    patterns: [
      /\b(dumela|kea|leboha|ka|kopo|hantle|wena|nna|ke|ho|e|la|hore|joang|hokae|neng)\b/gi,
      /\b(ee|che|hela|ntate|mme)\b/gi
    ],
    greetings: ['Dumela!', 'Dumelang!', 'Kea leboha!']
  },
  xitsonga: {
    code: 'ts',
    patterns: [
      /\b(avuxeni|ndza|khensa|kombela|kahle|wena|mina|ndzi|ku|e|la|leswaku|njhani|kwihi|nkarhi)\b/gi,
      /\b(ina|ee|aiwa|hela)\b/gi
    ],
    greetings: ['Avuxeni!', 'Xewani!', 'Ina!']
  },
  siswati: {
    code: 'ss',
    patterns: [
      /\b(sawubona|ngiyabonga|ngicela|kuhle|wena|mina|ngi|ku|e|la|kutsi|njani|kuphi|nini)\b/gi,
      /\b(yebo|cha|eish|make)\b/gi
    ],
    greetings: ['Sawubona!', 'Sanibonani!', 'Yebo make!']
  },
  tshivenda: {
    code: 've',
    patterns: [
      /\b(ndaa|ndo|livhuwa|humbela|zwavhudi|inwi|nne|ndi|u|e|la|uri|hani|hani|lini)\b/gi,
      /\b(ee|hai|vho|mukoma|khotsi)\b/gi
    ],
    greetings: ['Ndaa!', 'Matsheloni!', 'Vho-vho!']
  },
  ndebele: {
    code: 'nr',
    patterns: [
      /\b(lotjhani|ngiyabonga|ngicela|kuhle|wena|mina|ngi|ku|e|la|ukuthi|njani|kuphi|nini)\b/gi,
      /\b(yebo|cha|eish|baba|mama)\b/gi
    ],
    greetings: ['Lotjhani!', 'Salibonani!', 'Yebo baba!']
  }
};

export function detectSALanguage(text: string): LanguageDetection {
  const cleanText = text.toLowerCase().trim();
  const results: Array<{ language: string; code: string; score: number }> = [];

  // Score each language based on pattern matches
  for (const [language, config] of Object.entries(SA_LANGUAGE_PATTERNS)) {
    let totalMatches = 0;

    for (const pattern of config.patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        totalMatches += matches.length;
      }
    }

    // Normalize score by text length
    const normalizedScore = totalMatches / cleanText.split(/\s+/).length;
    
    if (normalizedScore > 0) {
      results.push({
        language,
        code: config.code,
        score: normalizedScore
      });
    }
  }

  // Sort by score and return best match
  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    const detected = results[0];
    const config = SA_LANGUAGE_PATTERNS[detected.language as keyof typeof SA_LANGUAGE_PATTERNS];
    
    return {
      language: toLanguageName(detected.language),
      code: detected.code,
      confidence: Math.min(Math.max(detected.score * 100, 25), 95), // Keep confidence within [25,95]
      greeting: config.greetings[Math.floor(Math.random() * config.greetings.length)]
    };
  }

  // Default to English if no clear match
  return {
    language: 'English',
    code: 'en',
    confidence: 50,
    greeting: 'Hello!'
  };
}

export function getSALanguageGreeting(languageCode: string): string {
  const language = Object.entries(SA_LANGUAGE_PATTERNS).find(
    ([, config]) => config.code === languageCode
  );
  
  if (language) {
    const greetings = language[1].greetings;
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  return 'Hello!';
}

export function getAllSALanguages() {
  return Object.entries(SA_LANGUAGE_PATTERNS).map(([name, config]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    code: config.code,
    greetings: config.greetings
  }));
}