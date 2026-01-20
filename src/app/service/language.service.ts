import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../services/storage.service';
import { UserService } from '../services/user.service';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly STORAGE_KEY = 'language';
  private readonly DEFAULT_LANGUAGE = 'en';
  selected: string = this.DEFAULT_LANGUAGE;

  constructor(
    private translate: TranslateService,
    private storageService: StorageService,
    private userService: UserService
  ) {}

  /**
   * Initialize language on app start
   * Should be called in app.component.ts ngOnInit
   */
  async initializeLanguage(): Promise<void> {
    try {
      // Set default language first
      this.translate.setDefaultLang(this.DEFAULT_LANGUAGE);
      
      // Load saved language preference
      const savedLang = await this.storageService.get(this.STORAGE_KEY);
      
      if (savedLang && ['en', 'hi', 'mr'].includes(savedLang)) {
        this.selected = savedLang;
        await this.translate.use(savedLang).toPromise();
        console.log(`🌐 Language initialized: ${savedLang}`);
      } else {
        // No saved language, use default
        this.selected = this.DEFAULT_LANGUAGE;
        await this.translate.use(this.DEFAULT_LANGUAGE).toPromise();
        await this.storageService.set(this.STORAGE_KEY, this.DEFAULT_LANGUAGE);
        console.log(`🌐 Language initialized with default: ${this.DEFAULT_LANGUAGE}`);
      }
    } catch (error) {
      console.error('Error initializing language:', error);
      // Fallback to default
      this.selected = this.DEFAULT_LANGUAGE;
      this.translate.use(this.DEFAULT_LANGUAGE);
    }
  }

  /**
   * Set language and persist to storage
   */
  async setLanguage(lang: string): Promise<void> {
    if (!['en', 'hi', 'mr'].includes(lang)) {
      console.warn(`Invalid language code: ${lang}, using default`);
      lang = this.DEFAULT_LANGUAGE;
    }

    try {
      this.selected = lang;
      await this.translate.use(lang).toPromise();
      await this.storageService.set(this.STORAGE_KEY, lang);
      
      // Also update user preferences if user is logged in
      try {
        await this.userService.updatePreference('language', lang);
      } catch (error) {
        console.warn('Could not update user preference:', error);
      }
      
      console.log(`🌐 Language changed to: ${lang}`);
    } catch (error) {
      console.error('Error setting language:', error);
      throw error;
    }
  }

  /**
   * Get current active language
   */
  getCurrentLanguage(): string {
    return this.selected;
  }

  /**
   * Get available languages
   */
  getLanguage() {
    return [
      {
        code: 'en',
        name: 'English',
        flag: '🇺🇸'
      },
      {
        code: 'hi',
        name: 'Hindi',
        flag: '🇮🇳'
      },
      {
        code: 'mr',
        name: 'Marathi',
        flag: '🇮🇳'
      }
    ];
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use initializeLanguage() instead
   */
  setInitialLanguage() {
    this.initializeLanguage();
  }
}
