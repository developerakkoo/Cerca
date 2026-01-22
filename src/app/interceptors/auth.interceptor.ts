import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpResponse,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private router: Router,
    private userService: UserService
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      tap((event: HttpEvent<any>) => {
        // Check response for blocked user status
        if (event instanceof HttpResponse) {
          const response = event.body;
          
          // Check if response indicates user is blocked
          if (response && response.isBlocked === true) {
            console.log('🚫 Blocked user detected in API response');
            this.handleBlockedUser();
          }
          
          // Check if user object in response has isActive === false
          if (response && response.isActive === false) {
            const currentUser = this.userService.getCurrentUser();
            if (currentUser && currentUser.isLoggedIn) {
              console.log('🚫 User isActive=false detected in API response');
              this.handleBlockedUser();
            }
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        // Handle 403 errors as potential blocked user indicator
        if (error.status === 403) {
          const errorBody = error.error;
          if (errorBody && errorBody.isBlocked === true) {
            console.log('🚫 403 Forbidden - User is blocked');
            this.handleBlockedUser();
          }
        }
        
        return throwError(() => error);
      })
    );
  }

  private async handleBlockedUser() {
    // Use UserService method to handle blocked user
    await this.userService.handleBlockedUser();
  }
}

