import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { AddressService, Address } from '../../services/address.service';
import { UserService } from '../../services/user.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-manage-address',
  templateUrl: './manage-address.page.html',
  styleUrls: ['./manage-address.page.scss'],
  standalone: false,
})
export class ManageAddressPage implements OnInit, OnDestroy {
  addresses: Address[] = [];
  pinnedAddresses: string[] = [];
  isLoading = false;
  isEmpty = false;
  private userSubscription?: Subscription;
  private pinnedSubscription?: Subscription;
  currentUserId: string = '';

  constructor(
    private addressService: AddressService,
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {
    // Subscribe to user changes
    this.userSubscription = this.userService.getUser().subscribe((user) => {
      if (user && user.id) {
        this.currentUserId = user.id;
        this.loadAddresses();
      }
    });

    // Subscribe to pinned addresses changes
    this.pinnedSubscription = this.addressService.pinnedAddresses$.subscribe(
      (pinned) => {
        this.pinnedAddresses = pinned;
        this.sortAddresses();
      }
    );

    // Check if returning from search page (address saved)
    this.route.queryParams.subscribe((params) => {
      if (params['saved'] === 'true') {
        this.presentToast('Address saved successfully', 'success');
        // Reload addresses
        if (this.currentUserId) {
          this.loadAddresses();
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if (this.pinnedSubscription) {
      this.pinnedSubscription.unsubscribe();
    }
  }

  /**
   * Load all addresses for the current user
   */
  async loadAddresses() {
    if (!this.currentUserId) {
      return;
    }

    this.isLoading = true;
    try {
      const addresses = await this.addressService
        .getUserAddresses(this.currentUserId)
        .toPromise();
      
      if (addresses) {
        this.addresses = addresses;
        this.isEmpty = this.addresses.length === 0;
        this.sortAddresses();
      } else {
        this.addresses = [];
        this.isEmpty = true;
      }
    } catch (error: any) {
      console.error('Error loading addresses:', error);
      
      // Handle specific error cases
      if (error?.status === 401 || error?.status === 403) {
        this.presentToast('Please log in again', 'warning');
        // Optionally redirect to login
        // this.router.navigate(['/mobile-login'], { replaceUrl: true });
      } else if (error?.status === 404) {
        // No addresses found - this is fine, just show empty state
        this.addresses = [];
        this.isEmpty = true;
      } else if (error?.status === 0 || error?.message?.includes('Network')) {
        this.presentToast('Network error. Please check your connection', 'danger');
      } else {
        this.presentToast(error?.error?.message || 'Failed to load addresses', 'danger');
      }
      
      this.addresses = [];
      this.isEmpty = true;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Sort addresses: pinned first, then by creation date
   */
  sortAddresses() {
    this.addresses.sort((a, b) => {
      const aPinned = this.addressService.isPinned(a._id || '');
      const bPinned = this.addressService.isPinned(b._id || '');

      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // If both pinned or both unpinned, sort by creation date (newest first)
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });
  }

  /**
   * Navigate to search page to add a new address
   */
  addAddress() {
    this.router.navigate(['/search'], {
      queryParams: {
        mode: 'add',
        returnTo: 'manage-address',
      },
    });
  }

  /**
   * Navigate to search page to edit an existing address
   */
  editAddress(address: Address) {
    if (!address._id) {
      return;
    }

    this.router.navigate(['/search'], {
      queryParams: {
        mode: 'edit',
        addressId: address._id,
        returnTo: 'manage-address',
      },
    });
  }

  /**
   * Delete an address with confirmation
   */
  async deleteAddress(address: Address) {
    if (!address._id) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Delete Address',
      message: `Are you sure you want to delete "${address.addressLine}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.performDelete(address._id!);
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Perform the actual delete operation
   */
  private async performDelete(addressId: string) {
    const loading = await this.loadingController.create({
      message: 'Deleting address...',
    });
    await loading.present();

    try {
      const success = await this.addressService.deleteAddress(addressId).toPromise();
      
      if (success) {
        this.presentToast('Address deleted successfully', 'success');
        // Reload addresses
        await this.loadAddresses();
      } else {
        this.presentToast('Failed to delete address', 'danger');
      }
    } catch (error: any) {
      console.error('Error deleting address:', error);
      
      // Handle specific error cases
      if (error?.status === 401 || error?.status === 403) {
        this.presentToast('Please log in again', 'warning');
      } else if (error?.status === 404) {
        this.presentToast('Address not found', 'warning');
        // Reload addresses to refresh list
        await this.loadAddresses();
      } else if (error?.status === 0 || error?.message?.includes('Network')) {
        this.presentToast('Network error. Please try again', 'danger');
      } else {
        this.presentToast(error?.error?.message || 'Failed to delete address', 'danger');
      }
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Toggle pin status of an address
   */
  async togglePin(address: Address) {
    if (!address._id) {
      return;
    }

    try {
      const isNowPinned = await this.addressService.togglePin(address._id);
      this.presentToast(
        isNowPinned ? 'Address pinned' : 'Address unpinned',
        'success'
      );
      this.sortAddresses();
    } catch (error) {
      console.error('Error toggling pin:', error);
      this.presentToast('Failed to update pin status', 'danger');
    }
  }

  /**
   * Check if address is pinned
   */
  isPinned(addressId?: string): boolean {
    if (!addressId) return false;
    return this.addressService.isPinned(addressId);
  }

  /**
   * Refresh addresses list
   */
  async doRefresh(event: any) {
    await this.loadAddresses();
    event.target.complete();
  }

  /**
   * Track by function for ngFor
   */
  trackByAddressId(index: number, address: Address): string {
    return address._id || index.toString();
  }

  /**
   * Show toast message
   */
  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}

