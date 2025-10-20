import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RideService } from 'src/app/services/ride.service';

@Component({
  selector: 'app-cancel-order',
  templateUrl: './cancel-order.page.html',
  styleUrls: ['./cancel-order.page.scss'],
  standalone: false,
})
export class CancelOrderPage implements OnInit {
  showAlert = false;
  selectedReason: string = '';
  cancellationReasons = [
    'Driver is taking too long',
    'Wrong pickup location',
    'Found another ride',
    'Changed my mind',
    'Emergency',
    'Other',
  ];

  constructor(private router: Router, private rideService: RideService) {}

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
    this.selectedReason = reason;
  }

  async submit() {
    if (!this.selectedReason) {
      console.warn('Please select a cancellation reason');
      return;
    }

    try {
      console.log('📤 Cancelling ride with reason:', this.selectedReason);

      // Cancel via Socket.IO
      await this.rideService.cancelRide(this.selectedReason);

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
    this.router.navigate(['/tabs/tab1'], {
      replaceUrl: true, // Clear navigation stack
    });
  }
}
