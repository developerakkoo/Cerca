import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ValidateCouponRequest {
  couponCode: string;
  userId: string;
  rideFare: number;
  service?: string;
  rideType?: string;
}

export interface ValidateCouponResponse {
  success: boolean;
  message: string;
  data?: {
    coupon: {
      code: string;
      type: string;
      description: string;
    };
    originalFare: number;
    discountAmount: number;
    finalFare: number;
    canApply: boolean;
  };
}

@Injectable({
  providedIn: 'root',
})
export class CouponService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Validate a coupon code before applying
   */
  validateCoupon(request: ValidateCouponRequest): Observable<ValidateCouponResponse> {
    return this.http
      .post<ValidateCouponResponse>(`${this.apiUrl}/coupons/validate`, request)
      .pipe(
        catchError((error) => {
          console.error('Error validating coupon:', error);
          // Return error response format
          return of({
            success: false,
            message: error.error?.message || 'Failed to validate coupon code',
          } as ValidateCouponResponse);
        })
      );
  }

  /**
   * Apply coupon to a ride (typically called after ride creation)
   */
  applyCoupon(
    couponCode: string,
    userId: string,
    rideId: string,
    rideFare: number
  ): Observable<{ success: boolean; message: string; data?: any }> {
    return this.http
      .post<{ success: boolean; message: string; data?: any }>(
        `${this.apiUrl}/coupons/apply`,
        {
          couponCode,
          userId,
          rideId,
          rideFare,
        }
      )
      .pipe(
        catchError((error) => {
          console.error('Error applying coupon:', error);
          return of({
            success: false,
            message: error.error?.message || 'Failed to apply coupon',
          });
        })
      );
  }

  /**
   * Get available gifts for a user
   */
  getUserGifts(userId: string): Observable<{ success: boolean; message: string; data?: any[] }> {
    return this.http
      .get<{ success: boolean; message: string; data?: any[] }>(
        `${this.apiUrl}/coupons/user/${userId}/gifts`
      )
      .pipe(
        catchError((error) => {
          console.error('Error fetching user gifts:', error);
          return of({
            success: false,
            message: error.error?.message || 'Failed to fetch gifts',
            data: [],
          });
        })
      );
  }
}

