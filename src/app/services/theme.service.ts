import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { StorageService } from './storage.service';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'system' | 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'theme_mode';
  private themeMode: ThemeMode = 'system';
  private systemPreferenceListener?: MediaQueryList;
  private themeSubject = new BehaviorSubject<boolean>(false);
  public theme$: Observable<boolean> = this.themeSubject.asObservable();

  constructor(
    private platform: Platform,
    private storageService: StorageService
  ) {}

  /**
   * Initialize theme on app start
   * Should be called in app.component.ts ngOnInit
   */
  async initializeTheme(): Promise<void> {
    try {
      // Load saved theme preference
      const savedTheme = await this.storageService.get(this.THEME_STORAGE_KEY);
      
      if (savedTheme && ['system', 'light', 'dark'].includes(savedTheme)) {
        this.themeMode = savedTheme as ThemeMode;
      } else {
        // Default to system preference
        this.themeMode = 'system';
        await this.storageService.set(this.THEME_STORAGE_KEY, 'system');
      }

      // Set up system preference listener
      this.setupSystemPreferenceListener();

      // Apply theme based on current mode
      await this.applyTheme();
    } catch (error) {
      console.error('Error initializing theme:', error);
      // Fallback to system preference
      this.themeMode = 'system';
      this.applyTheme();
    }
  }

  /**
   * Set theme mode (system, light, or dark)
   */
  async setThemeMode(mode: ThemeMode): Promise<void> {
    this.themeMode = mode;
    await this.storageService.set(this.THEME_STORAGE_KEY, mode);
    await this.applyTheme();
  }

  /**
   * Toggle between light and dark (ignores system mode)
   */
  async toggleTheme(): Promise<void> {
    const currentIsDark = this.isDarkMode();
    const newMode: ThemeMode = currentIsDark ? 'light' : 'dark';
    await this.setThemeMode(newMode);
  }

  /**
   * Get current theme mode
   */
  getThemeMode(): ThemeMode {
    return this.themeMode;
  }

  /**
   * Get current active theme (light or dark)
   */
  getCurrentTheme(): 'light' | 'dark' {
    if (this.themeMode === 'system') {
      return this.getSystemPreference();
    }
    return this.themeMode;
  }

  /**
   * Check if dark mode is currently active
   */
  isDarkMode(): boolean {
    return this.getCurrentTheme() === 'dark';
  }

  /**
   * Get system preference
   */
  private getSystemPreference(): 'light' | 'dark' {
    if (this.platform.is('capacitor')) {
      // For native platforms, check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // For web, check media query
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * Set up listener for system preference changes
   */
  private setupSystemPreferenceListener(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.systemPreferenceListener = window.matchMedia('(prefers-color-scheme: dark)');
      
      // Listen for system preference changes (only when in system mode)
      this.systemPreferenceListener.addEventListener('change', (e) => {
        if (this.themeMode === 'system') {
          this.applyTheme();
        }
      });
    }
  }

  /**
   * Apply theme based on current mode
   */
  private async applyTheme(): Promise<void> {
    const isDark = this.isDarkMode();
    
    // Explicitly add or remove Ionic's dark palette class
    if (isDark) {
      document.documentElement.classList.add('ion-palette-dark');
    } else {
      document.documentElement.classList.remove('ion-palette-dark');
    }
    
    // Also toggle body class for backward compatibility
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    
    // Update subject for subscribers
    this.themeSubject.next(isDark);
    
    console.log(`🎨 Theme applied: ${this.themeMode} -> ${isDark ? 'dark' : 'light'}`);
    console.log(`   Class present: ${document.documentElement.classList.contains('ion-palette-dark')}`);
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    if (this.systemPreferenceListener) {
      this.systemPreferenceListener.removeEventListener('change', () => {});
    }
  }
} 