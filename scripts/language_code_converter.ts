// languageCodeConverter.ts

// ISO 639-3 to ISO 639-1 mapping
const iso639_3To639_1: { [key: string]: string } = {
  eng: 'en',  // English
  cmn: 'zh',  // Mandarin Chinese
  yue: 'zh',  // Cantonese
  wuu: 'zh',  // Wu Chinese
  jpn: 'ja',  // Japanese
  kor: 'ko',  // Korean
  fra: 'fr',  // French
  deu: 'de',  // German
  spa: 'es',  // Spanish
  rus: 'ru',  // Russian
  ara: 'ar',  // Arabic
  por: 'pt',  // Portuguese
  ita: 'it',  // Italian
  nld: 'nl',  // Dutch
  pol: 'pl',  // Polish
  hin: 'hi',  // Hindi
  urd: 'ur',  // Urdu
  tur: 'tr',  // Turkish
  swe: 'sv',  // Swedish
  dan: 'da',  // Danish
  nor: 'no',  // Norwegian
  fin: 'fi',  // Finnish
  ces: 'cs',  // Czech
  ell: 'el',  // Greek
  bul: 'bg',  // Bulgarian
  ron: 'ro',  // Romanian
  mag: 'hi',  // Magahi → Hindi
  vie: 'vi',  // Vietnamese
  tha: 'th',  // Thai
  ind: 'id',  // Indonesian
  msa: 'ms',  // Malay
  hun: 'hu',  // Hungarian
  hau: 'ha',  // Hausa
  som: 'so',  // Somali
  zul: 'zu',  // Zulu
  // Add more as needed
};

/**
 * Convert 3-letter language code (ISO 639-3) to 2-letter code (ISO 639-1).
 * @param lang3 - 3-letter language code (e.g., 'cmn')
 * @returns 2-letter language code or null if not found
 */
export function convert3To2(lang3: string): string | null {
  const code = lang3.toLowerCase();
  return iso639_3To639_1[code] || null;
}

export default convert3To2;
// --- 示例用法 ---
// console.log(convert3To2("cmn")); // "zh"
// console.log(convert3To2("eng")); // "en"
// console.log(convert3To2("xyz")); // null