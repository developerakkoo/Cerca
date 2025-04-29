import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDark: boolean = false;

  constructor(private platform: Platform) {
    // Check if user prefers dark mode
    this.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  isDarkMode(): boolean {
    return this.isDark;
  }

  setTheme(isDark: boolean) {
    this.isDark = isDark;
    document.body.classList.toggle('dark', isDark);
  }
} 