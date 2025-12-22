import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { environment } from 'src/environments/environment';

export interface WalletBalance {
  userId: string;
  walletBalance: number;
  currency: string;
  user: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface WalletTransaction {
  _id: string;
  user: string;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedRide?: any;
  paymentMethod?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionHistoryResponse {
  transactions: WalletTransaction[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalTransactions: number;
    limit: number;
  };
  summary: {
    totalCredits: number;
    totalDebits: number;
  };
  currentBalance: number;
}

export interface TopUpRequest {
  amount: number;
  paymentMethod?: string;
  paymentGatewayTransactionId?: string;
  description?: string;
}

export interface TopUpResponse {
  transaction: WalletTransaction;
  newBalance: number;
  previousBalance: number;
}

export interface DeductRequest {
  amount: number;
  rideId?: string;
  description?: string;
}

export interface RefundRequest {
  amount: number;
  rideId?: string;
  reason?: string;
  description?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private apiUrl = environment.apiUrl;
  private walletBalanceSubject = new BehaviorSubject<number>(0);
  public walletBalance$ = this.walletBalanceSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {}

  /**
   * Get wallet balance for a user
   * Handles both response formats:
   * 1. {success: true, data: {walletBalance: 100, ...}}
   * 2. {walletBalance: 100}
   */
  getWalletBalance(userId: string): Observable<{ success: boolean; data: WalletBalance }> {
    return this.http
      .get<any>(`${this.apiUrl}/users/${userId}/wallet`)
      .pipe(
        map((response: any) => {
          let balance = 0;
          let formattedResponse: { success: boolean; data: WalletBalance };
          
          // Handle format 1: {success: true, data: {walletBalance: 100, ...}}
          if (response.success && response.data && response.data.walletBalance !== undefined) {
            balance = response.data.walletBalance;
            formattedResponse = response as { success: boolean; data: WalletBalance };
          }
          // Handle format 2: {walletBalance: 100}
          else if (response.walletBalance !== undefined) {
            balance = response.walletBalance;
            formattedResponse = {
              success: true,
              data: {
                userId: userId,
                walletBalance: balance,
                currency: 'INR',
                user: {
                  name: '',
                  email: '',
                  phone: '',
                },
              },
            };
          } else {
            // Default fallback
            formattedResponse = {
              success: false,
              data: {
                userId: userId,
                walletBalance: 0,
                currency: 'INR',
                user: {
                  name: '',
                  email: '',
                  phone: '',
                },
              },
            };
          }
          
          // Update the balance subject
          this.walletBalanceSubject.next(balance);
          
          return formattedResponse;
        })
      );
  }

  /**
   * Get transaction history with optional filters
   */
  getTransactions(
    userId: string,
    filters?: {
      page?: number;
      limit?: number;
      transactionType?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Observable<{ success: boolean; data: TransactionHistoryResponse }> {
    let params = new HttpParams();
    
    if (filters) {
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
      if (filters.transactionType) params = params.set('transactionType', filters.transactionType);
      if (filters.status) params = params.set('status', filters.status);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
    }

    return this.http.get<{ success: boolean; data: TransactionHistoryResponse }>(
      `${this.apiUrl}/users/${userId}/wallet/transactions`,
      { params }
    );
  }

  /**
   * Get a specific transaction by ID
   */
  getTransactionById(
    userId: string,
    transactionId: string
  ): Observable<{ success: boolean; data: { transaction: WalletTransaction } }> {
    return this.http.get<{ success: boolean; data: { transaction: WalletTransaction } }>(
      `${this.apiUrl}/users/${userId}/wallet/transactions/${transactionId}`
    );
  }

  /**
   * Top-up wallet
   */
  topUpWallet(
    userId: string,
    request: TopUpRequest
  ): Observable<{ success: boolean; message: string; data: TopUpResponse }> {
    return this.http
      .post<{ success: boolean; message: string; data: TopUpResponse }>(
        `${this.apiUrl}/users/${userId}/wallet/top-up`,
        request
      )
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.walletBalanceSubject.next(response.data.newBalance);
          }
        })
      );
  }

  /**
   * Deduct from wallet
   */
  deductFromWallet(
    userId: string,
    request: DeductRequest
  ): Observable<{ success: boolean; message: string; data: { transaction: WalletTransaction; newBalance: number; previousBalance: number } }> {
    return this.http
      .post<{ success: boolean; message: string; data: { transaction: WalletTransaction; newBalance: number; previousBalance: number } }>(
        `${this.apiUrl}/users/${userId}/wallet/deduct`,
        request
      )
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.walletBalanceSubject.next(response.data.newBalance);
          }
        })
      );
  }

  /**
   * Refund to wallet
   */
  refundToWallet(
    userId: string,
    request: RefundRequest
  ): Observable<{ success: boolean; message: string; data: { transaction: WalletTransaction; newBalance: number; previousBalance: number } }> {
    return this.http
      .post<{ success: boolean; message: string; data: { transaction: WalletTransaction; newBalance: number; previousBalance: number } }>(
        `${this.apiUrl}/users/${userId}/wallet/refund`,
        request
      )
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.walletBalanceSubject.next(response.data.newBalance);
          }
        })
      );
  }

  /**
   * Get wallet statistics
   */
  getWalletStatistics(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Observable<{ success: boolean; data: any }> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<{ success: boolean; data: any }>(
      `${this.apiUrl}/users/${userId}/wallet/statistics`,
      { params }
    );
  }

  /**
   * Get current wallet balance from BehaviorSubject
   */
  getCurrentBalance(): number {
    return this.walletBalanceSubject.value;
  }

  /**
   * Process hybrid payment (wallet + Razorpay)
   */
  processHybridPayment(
    userId: string,
    rideId: string,
    totalAmount: number,
    walletAmount: number,
    razorpayPaymentId: string
  ): Observable<{ success: boolean; message: string; data: { walletTransaction: WalletTransaction | null; newBalance: number; previousBalance: number; razorpayAmount: number; walletAmount: number; totalAmount: number } }> {
    return this.http
      .post<{ success: boolean; message: string; data: { walletTransaction: WalletTransaction | null; newBalance: number; previousBalance: number; razorpayAmount: number; walletAmount: number; totalAmount: number } }>(
        `${this.apiUrl}/users/${userId}/wallet/hybrid-payment`,
        {
          rideId,
          totalAmount,
          walletAmount,
          razorpayPaymentId,
        }
      )
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.walletBalanceSubject.next(response.data.newBalance);
          }
        })
      );
  }
}

