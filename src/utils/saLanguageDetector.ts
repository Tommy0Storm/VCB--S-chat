export interface LanguageCandidate {
  label: string;
  score: number;
  code?: string;
  language?: string;
}

export interface LanguageDetection {
  language: string;
  code: string;
  confidence: number;
  greeting?: string;
  source?: 'afrolid' | 'fallback';
  model?: string | null;
  candidates?: LanguageCandidate[];
  reason?: string;
}

type LanguageMeta = {
  name: string;
  greetings: string[];
  afrolidLabels: string[];
};

type LanguageCode = keyof typeof SA_LANGUAGES;

// type DetectionPayload = {
//   language?: unknown;
//   code?: unknown;
//   confidence?: unknown;
//   greeting?: unknown;
//   source?: unknown;
//   model?: unknown;
//   candidates?: unknown;
//   reason?: unknown;
// };

// type CandidatePayload = {
//   label?: unknown;
//   score?: unknown;
//   code?: unknown;
//   language?: unknown;
// };

const SA_LANGUAGES: Record<string, LanguageMeta> = {
  en: {
    name: 'English',
    greetings: ['Hello!', 'Good day!', 'Howzit!'],
    afrolidLabels: ['eng'],
  },
  af: {
    name: 'Afrikaans',
    greetings: ['Hallo!', 'Goeie dag!', 'Howzit!'],
    afrolidLabels: ['afr'],
  },
  zu: {
    name: 'Zulu',
    greetings: ['Sawubona!', 'Sanibonani!', 'Yebo!'],
    afrolidLabels: ['zul'],
  },
  xh: {
    name: 'Xhosa',
    greetings: ['Molo!', 'Molweni!', 'Ewe!'],
    afrolidLabels: ['xho'],
  },
  nso: {
    name: 'Sepedi',
    greetings: ['Dumela!', 'Thobela!', 'Ee!'],
    afrolidLabels: ['nso'],
  },
  tn: {
    name: 'Setswana',
    greetings: ['Dumela!', 'Dumelang!', 'Ee rra!'],
    afrolidLabels: ['tsn'],
  },
  st: {
    name: 'Sesotho',
    greetings: ['Dumela!', 'Dumelang!', 'Kea leboha!'],
    afrolidLabels: ['sot'],
  },
  ts: {
    name: 'Xitsonga',
    greetings: ['Avuxeni!', 'Xewani!', 'Ina!'],
    afrolidLabels: ['tso'],
  },
  ss: {
    name: 'siSwati',
    greetings: ['Sawubona!', 'Sanibonani!', 'Yebo make!'],
    afrolidLabels: ['ssw'],
  },
  ve: {
    name: 'Tshivenda',
    greetings: ['Ndaa!', 'Matsheloni!', 'Vho-vho!'],
    afrolidLabels: ['ven'],
  },
  nr: {
    name: 'isiNdebele',
    greetings: ['Lotjhani!', 'Salibonani!', 'Yebo baba!'],
    afrolidLabels: ['nbl'],
  },
};

// const DETECTION_ENDPOINT =
//   import.meta.env.VITE_LANGUAGE_DETECT_URL ??
//   (import.meta.env.DEV ? '/api/detect-language' : 'http://localhost:5000/detect-language');

// const DETECTION_TIMEOUT_MS = Number(import.meta.env.VITE_LANGUAGE_DETECT_TIMEOUT_MS ?? 20000);
// const MAX_CACHE_ENTRIES = 50;
// const detectionCache = new Map<string, LanguageDetection>();

// function cacheDetection(key: string, detection: LanguageDetection) {
//   detectionCache.set(key, detection);
//
//   if (detectionCache.size > MAX_CACHE_ENTRIES) {
//     const oldestKey = detectionCache.keys().next().value;
//     if (oldestKey) {
//       detectionCache.delete(oldestKey);
//     }
//   }
// }

function getLanguageMeta(code: string): LanguageMeta {
  const meta = SA_LANGUAGES[code];
  return meta ?? SA_LANGUAGES.en;
}

function pickGreeting(code: string): string {
  const greetings = getLanguageMeta(code).greetings;
  if (greetings.length === 0) {
    return 'Hello!';
  }
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// function clampConfidence(value: number | undefined): number {
//   if (typeof value !== 'number' || Number.isNaN(value)) {
//     return 55;
//   }
//   return Math.min(Math.max(value, 0), 100);
// }

// function normalizeCandidates(payload: unknown): LanguageCandidate[] | undefined {
//   if (!Array.isArray(payload)) {
//     return undefined;
//   }
//
//   const normalized: LanguageCandidate[] = [];
//
//   for (const entry of payload) {
//     const candidate = entry as CandidatePayload;
//     const label = typeof candidate.label === 'string' ? candidate.label : undefined;
//     const score = typeof candidate.score === 'number' ? candidate.score : undefined;
//     const code = typeof candidate.code === 'string' ? candidate.code : undefined;
//     const language = typeof candidate.language === 'string' ? candidate.language : undefined;
//
//     if (!label || score === undefined) {
//       continue;
//     }
//
//     normalized.push({ label, score, code, language });
//   }
//
//   return normalized.length > 0 ? normalized : undefined;
// }

// function normalizeDetectionPayload(payload: DetectionPayload): LanguageDetection {
//   const rawCode = typeof payload.code === 'string' ? payload.code : undefined;
//   const resolvedCode = rawCode && SA_LANGUAGES[rawCode] ? (rawCode as LanguageCode) : 'en';
//   const fallbackMeta = getLanguageMeta(resolvedCode);
//   const greeting = typeof payload.greeting === 'string' ? payload.greeting : pickGreeting(resolvedCode);
//
//   return {
//     language: typeof payload.language === 'string' ? payload.language : fallbackMeta.name,
//     code: resolvedCode,
//     confidence: clampConfidence(payload.confidence as number | undefined),
//     greeting,
//     source: payload.source === 'afrolid' ? 'afrolid' : 'fallback',
//     model: typeof payload.model === 'string' ? payload.model : null,
//     candidates: normalizeCandidates(payload.candidates),
//     reason: typeof payload.reason === 'string' ? payload.reason : undefined,
//   };
// }

function buildFallbackDetection(reason: string): LanguageDetection {
  const fallbackCode: LanguageCode = 'en';
  return {
    language: getLanguageMeta(fallbackCode).name,
    code: fallbackCode,
    confidence: 95,
    greeting: pickGreeting(fallbackCode),
    source: 'fallback',
    model: null,
    reason,
  };
}

export async function detectSALanguage(text: string): Promise<LanguageDetection> {
  const cleaned = (text ?? '').trim();
  if (!cleaned) {
    return buildFallbackDetection('empty_text');
  }

  // Always return English for now to fix detection issues
  const fallback = buildFallbackDetection('forced_english');
  return fallback;
}

export function getSALanguageGreeting(languageCode: string): string {
  return pickGreeting(languageCode in SA_LANGUAGES ? languageCode : 'en');
}

export function getAllSALanguages() {
  return Object.entries(SA_LANGUAGES).map(([code, meta]) => ({
    name: meta.name,
    code,
    greetings: [...meta.greetings],
  }));
}