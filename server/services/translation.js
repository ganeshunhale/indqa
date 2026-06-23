import translate from 'google-translate-api-x';
import logger from '../utils/logger.js';

/**
 * Translation + language detection.
 *
 * (Previously named "bhashini.js". It does NOT use the Bhashini API — it uses the
 * free google-translate-api-x library. Renamed for accuracy.)
 */

// Supported UI / translation languages.
const SUPPORTED_LANGUAGES = {
  hi: { name: 'Hindi', nativeName: 'हिन्दी' },
  mr: { name: 'Marathi', nativeName: 'मराठी' },
  bn: { name: 'Bengali', nativeName: 'বাংলা' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்' },
  te: { name: 'Telugu', nativeName: 'తెలుగు' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം' },
  en: { name: 'English', nativeName: 'English' },
};

/**
 * Translate text between languages using the free Google Translate library.
 * Falls back to auto-detect on the source language, then to the original text.
 */
export async function translateText(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;
  if (!text || text.trim().length === 0) return text;

  try {
    const result = await translate(text, { from: sourceLang, to: targetLang });
    return result.text;
  } catch (error) {
    logger.warn(`Translation error (${sourceLang} → ${targetLang}), retrying with auto-detect`, {
      error: error.message,
    });
    try {
      const result = await translate(text, { to: targetLang });
      return result.text;
    } catch (retryError) {
      logger.error('Translation retry failed; returning original text', { error: retryError.message });
      return text; // Graceful degradation: return the original text.
    }
  }
}

/** Detect language via Google Translate's auto-detect, with a Unicode fallback. */
export async function detectLanguageAuto(text) {
  try {
    const result = await translate(text, { to: 'en' });
    return result.from?.language?.iso || detectLanguage(text);
  } catch {
    return detectLanguage(text);
  }
}

/** Offline language detection using Unicode script ranges. */
export function detectLanguage(text) {
  const scripts = {
    hi: /[ऀ-ॿ]/, // Devanagari (Hindi/Marathi share this)
    bn: /[ঀ-৿]/, // Bengali
    ta: /[஀-௿]/, // Tamil
    te: /[ఀ-౿]/, // Telugu
    kn: /[ಀ-೿]/, // Kannada
    gu: /[઀-૿]/, // Gujarati
    pa: /[਀-੿]/, // Gurmukhi (Punjabi)
    ml: /[ഀ-ൿ]/, // Malayalam
  };

  for (const [lang, regex] of Object.entries(scripts)) {
    if (regex.test(text)) return lang;
  }
  return 'en';
}

export { SUPPORTED_LANGUAGES };
