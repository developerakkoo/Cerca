import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AddressService, Address, CreateAddressRequest, AddressType } from '../../services/address.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-address-details',
  templateUrl: './address-details.page.html',
  styleUrls: ['./address-details.page.scss'],
  standalone: false,
})
export class AddressDetailsPage implements OnInit {
  addressLine = '';
  formattedAddress = '';
  lat: number | null = null;
  lng: number | null = null;
  placeId: string | null = null;
  landmark = '';
  addressType: AddressType = 'other';
  addressTypes: { value: AddressType; labelKey: string }[] = [
    { value: 'home', labelKey: 'ADDRESS_DETAILS.types.home' },
    { value: 'office', labelKey: 'ADDRESS_DETAILS.types.office' },
    { value: 'other', labelKey: 'ADDRESS_DETAILS.types.other' },
  ];

  mode: 'add' | 'edit' = 'add';
  addressId: string | null = null;
  returnTo = 'manage-address';
  currentUserId = '';
  isSaving = false;

  constructor(
    private addressService: AddressService,
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    const state = history.state as Record<string, unknown> | undefined;
    const q = this.route.snapshot.queryParams;

    this.mode = (q['mode'] === 'edit' || state?.['addressMode'] === 'edit') ? 'edit' : 'add';
    this.addressId = (q['addressId'] as string) || (state?.['addressId'] as string) || null;
    this.returnTo = (q['returnTo'] as string) || (state?.['returnTo'] as string) || 'manage-address';

    if (state?.['addressLine']) this.addressLine = state['addressLine'] as string;
    if (state?.['formattedAddress']) this.formattedAddress = state['formattedAddress'] as string;
    if (state?.['address']) {
      const addr = state['address'] as string;
      if (!this.addressLine) this.addressLine = addr;
      if (!this.formattedAddress) this.formattedAddress = addr;
    }
    if (typeof state?.['lat'] === 'number') this.lat = state!['lat'];
    if (typeof state?.['lng'] === 'number') this.lng = state!['lng'];
    if (state?.['placeId']) this.placeId = state['placeId'] as string;

    this.userService.getUser().subscribe((user) => {
      if (user?.id) {
        this.currentUserId = user.id;
        if (this.addressId && (!this.lat || !this.lng)) {
          this.loadAddress();
        }
      }
    });
  }

  private loadAddress() {
    if (!this.addressId || !this.currentUserId) return;
    this.addressService.getAddressById(this.addressId, this.currentUserId).subscribe((address) => {
      if (address) {
        this.addressLine = address.addressLine;
        this.formattedAddress = address.formattedAddress || address.addressLine;
        this.landmark = address.landmark || '';
        this.addressType = (address.addressType as AddressType) || 'other';
        const coords = address.location?.coordinates;
        if (coords && coords.length === 2) {
          this.lng = coords[0];
          this.lat = coords[1];
        }
      }
    });
  }

  selectType(value: AddressType) {
    this.addressType = value;
  }

  async adjustOnMap() {
    if (this.lat == null || this.lng == null) return;
    this.router.navigate(['/pin-location'], {
      queryParams: {
        address: this.addressLine || this.formattedAddress,
        lat: this.lat,
        lng: this.lng,
        addressMode: this.mode,
        addressId: this.addressId || '',
        returnTo: 'address-details',
      },
      state: {
        returnTo: 'address-details',
        addressId: this.addressId,
        addressMode: this.mode,
      },
    });
  }

  changeLocation() {
    this.router.navigate(['/search'], {
      queryParams: {
        mode: 'edit',
        addressId: this.addressId || '',
        returnTo: 'address-details',
      },
    });
  }

  async save() {
    if (this.lat == null || this.lng == null || !this.addressLine.trim() || !this.currentUserId) {
      await this.presentToast('Please set a valid location', 'warning');
      return;
    }

    this.isSaving = true;
    const loading = await this.loadingController.create({
      message: this.mode === 'add' ? 'Saving address...' : 'Updating address...',
    });
    await loading.present();

    const addressData: CreateAddressRequest = {
      id: this.currentUserId,
      addressLine: this.addressLine.trim(),
      formattedAddress: (this.formattedAddress || this.addressLine).trim(),
      location: {
        type: 'Point',
        coordinates: [this.lng, this.lat],
      },
      landmark: this.landmark.trim() || undefined,
      placeId: this.placeId || undefined,
      addressType: this.addressType,
    };

    try {
      if (this.mode === 'add') {
        const created = await this.addressService.createAddress(addressData).toPromise();
        if (created) {
          await loading.dismiss();
          await this.presentToast('Address saved successfully', 'success');
          this.navigateBack();
        } else {
          await loading.dismiss();
          await this.presentToast('Failed to save address', 'danger');
        }
      } else if (this.addressId) {
        const updated = await this.addressService
          .updateAddress(this.addressId, this.currentUserId, addressData)
          .toPromise();
        if (updated) {
          await loading.dismiss();
          await this.presentToast('Address updated successfully', 'success');
          this.navigateBack();
        } else {
          await loading.dismiss();
          await this.presentToast('Failed to update address', 'danger');
        }
      } else {
        await loading.dismiss();
        await this.presentToast('Invalid edit state', 'danger');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      await loading.dismiss();
      await this.presentToast('Failed to save address', 'danger');
    } finally {
      this.isSaving = false;
    }
  }

  private navigateBack() {
    const path = this.returnTo === 'manage-address' ? '/manage-address' : '/manage-address';
    this.router.navigate([path], { queryParams: { saved: 'true' }, replaceUrl: true });
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
