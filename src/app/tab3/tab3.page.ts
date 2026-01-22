import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AnimationController, Platform, AlertController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { Subscription } from 'rxjs';
import { WalletService, WalletTransaction } from '../services/wallet.service';
import { PaymentService } from '../services/payment.service';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit, OnDestroy {
  balance: number = 0;
  transactions: WalletTransaction[] = [];
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  userId: string | null = null;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform,
    private walletService: WalletService,
    private paymentService: PaymentService,
    private storage: Storage,
    private router: Router,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private modalController: ModalController,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadUserId();
    await this.loadWalletData();
    this.animateBalance();
    
    // Subscribe to wallet balance updates - this will automatically update when balance changes
    const balanceSub = this.walletService.walletBalance$.subscribe((balance) => {
      console.log('💰 Wallet balance updated via subscription:', balance);
      this.balance = balance;
      // Manually trigger change detection to ensure UI updates
      this.cdr.detectChanges();
    });
    this.subscriptions.push(balanceSub);
  }

  async ionViewWillEnter() {
    // Refresh wallet data each time the tab becomes active
    await this.loadUserId();
    await this.loadWalletData();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private async loadUserId() {
    this.userId = await this.storage.get('userId');
    if (!this.userId) {
      console.error('User ID not found');
    }
  }

  private async loadWalletData() {
    if (!this.userId) {
      return;
    }

    this.isLoading = true;
    try {
      // Load wallet balance
      const balanceResponse = await this.walletService.getWalletBalance(this.userId).toPromise();
      if (balanceResponse?.success) {
        this.balance = balanceResponse.data.walletBalance;
      }

      // Load transactions
      const transactionsResponse = await this.walletService.getTransactions(this.userId, {
        page: 1,
        limit: 20
      }).toPromise();
      
      if (transactionsResponse?.success) {
        this.transactions = transactionsResponse.data.transactions || [];
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
      await this.showToast('Failed to load wallet data', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  async doRefresh(event: any) {
    this.isRefreshing = true;
    await this.loadWalletData();
    event.target.complete();
    this.isRefreshing = false;
  }

  async addMoney() {
    if (!this.userId) {
      await this.showToast('User not logged in', 'danger');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Add Money to Wallet',
      inputs: [
        {
          name: 'amount',
          type: 'number',
          placeholder: 'Enter amount (₹10 - ₹50,000)',
          attributes: {
            min: 10,
            max: 50000,
          },
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Quick Add ₹100',
          handler: () => {
            this.processTopUp(100);
          },
        },
        {
          text: 'Quick Add ₹500',
          handler: () => {
            this.processTopUp(500);
          },
        },
        {
          text: 'Quick Add ₹1000',
          handler: () => {
            this.processTopUp(1000);
          },
        },
        {
          text: 'Add',
          handler: (data) => {
            const amount = parseFloat(data.amount);
            if (!amount || amount < 10 || amount > 50000) {
              this.showToast('Please enter a valid amount between ₹10 and ₹50,000', 'danger');
              return false;
            }
            this.processTopUp(amount);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async processTopUp(amount: number) {
    if (!this.userId) {
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Processing payment...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Process payment through Razorpay
      await this.paymentService.processPayment(
        amount,
        async (paymentResponse) => {
          console.log('Payment Response:', paymentResponse);
          // Payment successful - top up wallet
          try {
            const topUpResponse = await this.walletService.topUpWallet(
              this.userId!,
              {
                amount,
                paymentMethod: 'RAZORPAY',
                paymentGatewayTransactionId: paymentResponse.razorpay_payment_id,
                description: `Wallet top-up of ₹${amount}`,
              }
            ).toPromise();

            if (topUpResponse?.success) {
              // The topUpWallet already updated walletBalanceSubject via tap operator
              // But we need to fetch from backend to ensure we have the latest value
              console.log('✅ Top-up successful, refreshing balance from backend...');
              
              // Immediately fetch and update wallet balance from backend
              if (this.userId) {
                try {
                  // Fetch latest wallet balance - this will:
                  // 1. Update walletBalanceSubject (which triggers subscription)
                  // 2. Return the latest balance
                  const balanceResponse = await this.walletService.getWalletBalance(this.userId).toPromise();
                  
                  if (balanceResponse?.success) {
                    // Update local balance directly (subscription should also update it, but this ensures it)
                    this.balance = balanceResponse.data.walletBalance;
                    console.log('✅ Wallet balance fetched and updated:', this.balance);
                    console.log('   Previous balance from top-up response:', topUpResponse.data.newBalance);
                    // Manually trigger change detection to ensure UI updates immediately
                    this.cdr.detectChanges();
                  } else {
                    // Fallback: use the balance from top-up response
                    if (topUpResponse.data?.newBalance !== undefined) {
                      this.balance = topUpResponse.data.newBalance;
                      console.log('✅ Using balance from top-up response:', this.balance);
                      // Manually trigger change detection
                      this.cdr.detectChanges();
                    }
                  }
                  
                  // Refresh transactions list to show the new top-up transaction
                  const transactionsResponse = await this.walletService.getTransactions(this.userId, {
                    page: 1,
                    limit: 20
                  }).toPromise();
                  
                  if (transactionsResponse?.success) {
                    this.transactions = transactionsResponse.data.transactions || [];
                    console.log('✅ Transactions refreshed, count:', this.transactions.length);
                  }
                  
                  await this.showToast(`Successfully added ₹${amount} to wallet!`, 'success');
                } catch (error) {
                  console.error('❌ Error refreshing wallet data:', error);
                  // Fallback: use the balance from top-up response
                  if (topUpResponse.data?.newBalance !== undefined) {
                    this.balance = topUpResponse.data.newBalance;
                    console.log('✅ Using balance from top-up response (fallback):', this.balance);
                  }
                  await this.showToast(`Successfully added ₹${amount} to wallet!`, 'success');
                }
              } else {
                await this.showToast(`Successfully added ₹${amount} to wallet!`, 'success');
              }
            } else {
              await this.showToast('Payment successful but wallet top-up failed. Please contact support.', 'warning');
            }
          } catch (error) {
            console.error('Error topping up wallet:', error);
            await this.showToast('Payment successful but wallet top-up failed. Please contact support.', 'warning');
          }
        },
        async (error) => {
          // Payment failed
          console.error('Payment failed:', error);
          await this.showToast('Payment failed. Please try again.', 'danger');
        }
      );
    } catch (error) {
      console.error('Error processing payment:', error);
      await this.showToast('Failed to process payment. Please try again.', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  useMoney() {
    // Navigate to payment page for ride booking
    this.router.navigate(['/payment']);
  }

  viewAllTransactions() {
    // Navigate to view all transactions page
    this.router.navigate(['/view-transactions']);
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

  private animateBalance() {
    setTimeout(() => {
      const element = document.querySelector('.balance-amount');
      if (element) {
        const animation = this.animationCtrl
          .create()
          .addElement(element)
          .duration(1000)
          .easing('ease-out')
          .fromTo('transform', 'scale(0.8)', 'scale(1)')
          .fromTo('opacity', '0', '1');

        animation.play();
      }
    }, 100);
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
