import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { UserService } from '../services/user.service';
import { StorageService } from '../services/storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private userService: UserService,
    private storageService: StorageService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.checkAuthentication(state.url);
  }

  private async checkAuthentication(url: string): Promise<boolean> {
    try {
      // Check if user data exists in storage
      const userData = await this.storageService.get('user');
      const token = await this.storageService.get('token');
      const userId = await this.storageService.get('userId');

      if (!userData || !token || !userId) {
        // No user data or token found, redirect to login
        this.router.navigate(['/mobile-login'], { 
          queryParams: { returnUrl: url } 
        });
        return false;
      }

      // Parse user data
      let user;
      try {
        user = typeof userData === 'string' ? JSON.parse(userData) : userData;
      } catch (e) {
        // Invalid user data, clear and redirect
        await this.clearSession();
        this.router.navigate(['/mobile-login'], { 
          queryParams: { returnUrl: url } 
        });
        return false;
      }

      // Check if user is logged in
      if (!user.isLoggedIn) {
        this.router.navigate(['/mobile-login'], { 
          queryParams: { returnUrl: url } 
        });
        return false;
      }

      // Lightweight token check: just verify token exists and check expiry
      // Full validation happens on app start via autoLogin()
      // Token already retrieved above, reuse it
      if (!token) {
        await this.clearSession();
        this.router.navigate(['/mobile-login'], { 
          queryParams: { returnUrl: url } 
        });
        return false;
      }
      
      // Check token expiry if stored
      const tokenExpiry = await this.storageService.get('tokenExpiry');
      if (tokenExpiry) {
        const expiryTime = new Date(tokenExpiry).getTime();
        const now = Date.now();
        // If token expired, try to refresh
        if (expiryTime - now < 0) {
          const refreshed = await this.userService.refreshToken();
          if (!refreshed) {
            await this.clearSession();
            this.router.navigate(['/mobile-login'], { 
              queryParams: { returnUrl: url } 
            });
            return false;
          }
        }
      }

      // User is authenticated, allow access
      return true;
    } catch (error) {
      console.error('AuthGuard error:', error);
      // On error, redirect to login for safety
      await this.clearSession();
      this.router.navigate(['/mobile-login']);
      return false;
    }
  }

  private async clearSession(): Promise<void> {
    await this.storageService.remove('user');
    await this.storageService.remove('userId');
    await this.storageService.remove('token');
    this.userService.logout();
  }
}

