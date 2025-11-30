import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RideService } from 'src/app/services/ride.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-cancel-order',
  templateUrl: './cancel-order.page.html',
  styleUrls: ['./cancel-order.page.scss'],
  standalone: false,
})
export class CancelOrderPage implements OnInit {
  showAlert = false;
  selectedReason: string = '';
  customReason: string = '';
  cancellationReasons = [
    'Driver is taking too long',
    'Wrong pickup location',
    'Found another ride',
    'Changed my mind',
    'Emergency',
    'Other',
  ];

  constructor(
    private router: Router,
    private rideService: RideService,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    // Check if there's an active ride
    const ride = this.rideService.getCurrentRideValue();
    if (!ride) {
      // No active ride, navigate back
      console.warn('No active ride to cancel');
      this.router.navigate(['/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }

  selectReason(reason: string) {
    // Toggle selection - if clicking the same reason, deselect it
    if (this.selectedReason === reason) {
      this.selectedReason = '';
      this.customReason = '';
    } else {
      this.selectedReason = reason;
      // Clear custom reason if not "Other"
      if (reason !== 'Other') {
        this.customReason = '';
      }
    }
  }

  onTextareaFocus() {
    // Ensure "Other" is selected when user focuses on textarea
    if (this.selectedReason !== 'Other') {
      this.selectedReason = 'Other';
    }
  }

  onTextareaBlur() {
    // Optional: Handle blur if needed
  }

  async submit() {
    // Validate reason selection
    if (!this.selectedReason) {
      const toast = await this.toastController.create({
        message: 'Please select a cancellation reason',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    // Validate custom reason if "Other" is selected
    if (this.selectedReason === 'Other' && !this.customReason.trim()) {
      const toast = await this.toastController.create({
        message: 'Please provide a reason for cancellation',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    try {
      // Build the final reason string
      let finalReason = this.selectedReason;
      if (this.selectedReason === 'Other' && this.customReason.trim()) {
        finalReason = this.customReason.trim();
      }

      console.log('📤 Cancelling ride with reason:', finalReason);

      // Cancel via Socket.IO
      await this.rideService.cancelRide(finalReason);

      // Show confirmation
      this.showAlert = true;
    } catch (error) {
      console.error('Error cancelling ride:', error);
      // Show alert anyway and navigate back
      this.showAlert = true;
    }
  }

  closeAlert() {
    this.showAlert = false;
    this.router.navigate(['/tabs/tabs/tab1'], {
      replaceUrl: true, // Clear navigation stack
    });
  }
}
