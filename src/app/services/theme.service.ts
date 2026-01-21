import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'system' | 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
  private themeSubject = new BehaviorSubject<boolean>(false);
  public theme$: Observable<boolean> = this.themeSubject.asObservable();
  private mutationObserver?: MutationObserver;
  private checkInterval?: any;

  constructor() {}

  /**
   * Initialize theme on app start
   * Always forces light theme regardless of device settings
   * Sets up continuous monitoring to prevent dark theme from being applied
   * Should be called in app.component.ts ngOnInit
   */
  async initializeTheme(): Promise<void> {
    // Immediately apply light theme
    this.applyTheme();
    
    // Set up continuous monitoring to prevent dark classes from being added
    this.setupContinuousMonitoring();
  }

  /**
   * Set up continuous monitoring to prevent dark theme classes
   */
  private setupContinuousMonitoring(): void {
    // Use MutationObserver to watch for class changes on documentElement and body
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver((mutations) => {
        let shouldRemove = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target as HTMLElement;
            if (target.classList.contains('ion-palette-dark') || target.classList.contains('dark')) {
              shouldRemove = true;
            }
          }
        });
        
        if (shouldRemove) {
          this.applyTheme();
        }
      });

      // Observe changes to documentElement and body
      this.mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      this.mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    // Fallback: Periodic check every 500ms to ensure dark classes are removed
    this.checkInterval = setInterval(() => {
      this.applyTheme();
    }, 500);
  }

  /**
   * Set theme mode - disabled (no-op)
   * Theme is always forced to light mode
   */
  async setThemeMode(mode: ThemeMode): Promise<void> {
    // No-op: Theme is always light, ignoring any mode changes
    console.log('Theme switching is disabled. App always uses light theme.');
    this.applyTheme();
  }

  /**
   * Toggle between light and dark - disabled (no-op)
   * Theme is always forced to light mode
   */
  async toggleTheme(): Promise<void> {
    // No-op: Theme is always light, toggle is disabled
    console.log('Theme toggle is disabled. App always uses light theme.');
    this.applyTheme();
  }

  /**
   * Get current theme mode
   * Always returns 'light' since theme is forced to light
   */
  getThemeMode(): ThemeMode {
    return 'light';
  }

  /**
   * Get current active theme (light or dark)
   * Always returns 'light' since theme is forced to light
   */
  getCurrentTheme(): 'light' | 'dark' {
    return 'light';
  }

  /**
   * Check if dark mode is currently active
   * Always returns false since theme is forced to light
   */
  isDarkMode(): boolean {
    return false;
  }

  /**
   * Apply theme - always forces light theme
   * Removes any dark theme classes to ensure light theme is active
   */
  private applyTheme(): void {
    // Always remove dark theme classes to force light theme
    if (document.documentElement) {
      document.documentElement.classList.remove('ion-palette-dark');
    }
    if (document.body) {
      document.body.classList.remove('dark');
    }
    
    // Update subject for subscribers (always false = light mode)
    this.themeSubject.next(false);
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
} 