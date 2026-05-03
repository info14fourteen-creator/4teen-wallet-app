import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries } from './dictionaries';

export type AppLanguageCode =
  | 'en'
  | 'ru'
  | 'uz'
  | 'tr'
  | 'de'
  | 'fr'
  | 'es'
  | 'it'
  | 'pt'
  | 'nl'
  | 'pl'
  | 'ar'
  | 'hi'
  | 'ja'
  | 'zh-CN'
  | 'ko';

export type AppLanguageOption = {
  code: AppLanguageCode;
  nativeName: string;
  englishName: string;
};

const STORAGE_KEY = 'settings.language.v1';
const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

const LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'uz', nativeName: "O‘zbekcha", englishName: 'Uzbek' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
];

let languageMemory: AppLanguageCode = DEFAULT_LANGUAGE;
let languageLoaded = false;
const listeners = new Set<(language: AppLanguageCode) => void>();

function isLanguageCode(value: string): value is AppLanguageCode {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? ''));
}

export function getLanguageOptions() {
  return LANGUAGE_OPTIONS;
}

export function getDefaultLanguage() {
  return DEFAULT_LANGUAGE;
}

export function getCachedLanguage() {
  return languageMemory;
}

export function getLanguageLabel(code: AppLanguageCode) {
  return LANGUAGE_OPTIONS.find((option) => option.code === code)?.nativeName || code;
}

export function getLanguageLocaleTag(language: AppLanguageCode = languageMemory) {
  switch (language) {
    case 'ru':
      return 'ru-RU';
    case 'uz':
      return 'uz-UZ';
    case 'tr':
      return 'tr-TR';
    case 'de':
      return 'de-DE';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'it':
      return 'it-IT';
    case 'pt':
      return 'pt-PT';
    case 'nl':
      return 'nl-NL';
    case 'pl':
      return 'pl-PL';
    case 'ar':
      return 'ar-SA';
    case 'hi':
      return 'hi-IN';
    case 'ja':
      return 'ja-JP';
    case 'zh-CN':
      return 'zh-CN';
    case 'ko':
      return 'ko-KR';
    default:
      return 'en-US';
  }
}

export function isRtlLanguage(language: AppLanguageCode = languageMemory) {
  return language === 'ar';
}

export function getCachedLanguageLabel() {
  return getLanguageLabel(languageMemory);
}

export function subscribeLanguageChange(listener: (language: AppLanguageCode) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(language: AppLanguageCode) {
  for (const listener of listeners) {
    listener(language);
  }
}

export async function getLanguage(): Promise<AppLanguageCode> {
  if (languageLoaded) {
    return languageMemory;
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const next = String(raw || '').trim();
    if (isLanguageCode(next)) {
      languageMemory = next;
    }
  } catch (error) {
    console.error('Failed to read language:', error);
  }

  languageLoaded = true;
  return languageMemory;
}

export async function setLanguage(language: AppLanguageCode): Promise<void> {
  languageMemory = language;
  languageLoaded = true;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, language);
  } catch (error) {
    console.error('Failed to write language:', error);
    throw error;
  }

  notify(language);
}

export function translateNow(key: string, params?: Record<string, string | number>, language = languageMemory) {
  const dict = dictionaries[language] || {};
  const englishDict = dictionaries.en || {};
  const template = dict[key] || englishDict[key] || key;
  return interpolate(template, params);
}

type I18nContextValue = {
  language: AppLanguageCode;
  setLanguage: (language: AppLanguageCode) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguageCode>(getCachedLanguage());

  useEffect(() => {
    let cancelled = false;
    void getLanguage().then((next) => {
      if (!cancelled) {
        setLanguageState(next);
      }
    });

    const unsubscribe = subscribeLanguageChange((next) => {
      setLanguageState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleSetLanguage = useCallback(async (next: AppLanguageCode) => {
    await setLanguage(next);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translateNow(key, params, language);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: handleSetLanguage,
      t,
    }),
    [handleSetLanguage, language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}

export function useLocaleLayout() {
  const { language } = useI18n();
  const isRTL = isRtlLanguage(language);

  return useMemo(
    () => ({
      isRTL,
      textStart: {
        textAlign: isRTL ? 'right' : 'left',
        writingDirection: isRTL ? 'rtl' : 'ltr',
      } as const,
      row: {
        flexDirection: isRTL ? 'row-reverse' : 'row',
      } as const,
      rowBetween: {
        flexDirection: isRTL ? 'row-reverse' : 'row',
        justifyContent: 'space-between',
      } as const,
      alignStart: {
        alignItems: isRTL ? 'flex-end' : 'flex-start',
      } as const,
      alignEnd: {
        alignItems: isRTL ? 'flex-start' : 'flex-end',
      } as const,
    }),
    [isRTL]
  );
}
