import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

const STORAGE_KEY = 'language';
const DEFAULT_LANGUAGE = 'en';
const VALID_LANGS = ['en', 'hi', 'mr'] as const;

export function i18nAppInitializerFactory(
  translate: TranslateService,
  storage: Storage
): () => Promise<void> {
  return async () => {
    try {
      await storage.create();
      translate.setDefaultLang(DEFAULT_LANGUAGE);
      const savedLang = await storage.get(STORAGE_KEY);
      let lang = DEFAULT_LANGUAGE;
      if (
        typeof savedLang === 'string' &&
        (VALID_LANGS as readonly string[]).includes(savedLang)
      ) {
        lang = savedLang;
      } else {
        await storage.set(STORAGE_KEY, DEFAULT_LANGUAGE);
      }
      await firstValueFrom(translate.use(lang));
    } catch (error) {
      console.error('i18n APP_INITIALIZER failed:', error);
      translate.setDefaultLang(DEFAULT_LANGUAGE);
      try {
        await firstValueFrom(translate.use(DEFAULT_LANGUAGE));
      } catch {
        translate.use(DEFAULT_LANGUAGE);
      }
    }
  };
}
