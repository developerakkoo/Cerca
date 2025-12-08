import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { WalletService, WalletTransaction } from '../services/wallet.service';
import { InfiniteScrollCustomEvent } from '@ionic/angular';

@Component({
  selector: 'app-view-transactions',
  templateUrl: './view-transactions.page.html',
  styleUrls: ['./view-transactions.page.scss'],
  standalone: false,
})
export class ViewTransactionsPage implements OnInit {
  transactions: WalletTransaction[] = [];
  userId: string | null = null;
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 0;
  isLoading: boolean = false;
  hasMore: boolean = true;

  constructor(
    private walletService: WalletService,
    private storage: Storage,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadUserId();
    if (this.userId) {
      await this.loadTransactions(1);
    }
  }

  private async loadUserId() {
    this.userId = await this.storage.get('userId');
    if (!this.userId) {
      console.error('User ID not found');
      // Navigate back if no user ID
      this.router.navigate(['/tabs/tab3']);
    }
  }

  async loadTransactions(page: number) {
    if (!this.userId || this.isLoading) {
      return;
    }

    this.isLoading = true;
    try {
      const response = await this.walletService.getTransactions(this.userId, {
        page: page,
        limit: this.pageSize
      }).toPromise();

      if (response?.success) {
        const newTransactions = response.data.transactions || [];
        
        if (page === 1) {
          // First page - replace transactions
          this.transactions = newTransactions;
        } else {
          // Subsequent pages - append transactions
          this.transactions = [...this.transactions, ...newTransactions];
        }

        // Update pagination info
        this.totalPages = response.data.pagination?.totalPages || 0;
        this.currentPage = response.data.pagination?.currentPage || page;
        this.hasMore = this.currentPage < this.totalPages;

        console.log(`✅ Loaded page ${page}:`, {
          transactionsLoaded: newTransactions.length,
          totalTransactions: this.transactions.length,
          currentPage: this.currentPage,
          totalPages: this.totalPages,
          hasMore: this.hasMore
        });

        // Trigger change detection
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadMoreTransactions(event: InfiniteScrollCustomEvent) {
    if (!this.hasMore || this.isLoading) {
      event.target.complete();
      return;
    }

    const nextPage = this.currentPage + 1;
    await this.loadTransactions(nextPage);
    
    // Complete the infinite scroll event
    event.target.complete();
  }

  getTransactionTypeDisplay(type: string): string {
    const typeMap: { [key: string]: string } = {
      'TOP_UP': 'Wallet Top-up',
      'RIDE_PAYMENT': 'Ride Payment',
      'REFUND': 'Refund',
      'BONUS': 'Bonus',
      'REFERRAL_REWARD': 'Referral Reward',
      'PROMO_CREDIT': 'Promo Credit',
      'WITHDRAWAL': 'Withdrawal',
      'ADMIN_ADJUSTMENT': 'Admin Adjustment',
      'CANCELLATION_FEE': 'Cancellation Fee',
    };
    return typeMap[type] || type;
  }

  isCreditTransaction(type: string): boolean {
    const creditTypes = ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'PROMO_CREDIT', 'ADMIN_ADJUSTMENT'];
    return creditTypes.includes(type);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'FAILED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'medium';
    }
  }
}
