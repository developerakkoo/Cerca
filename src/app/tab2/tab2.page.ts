import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RideService, Ride } from '../services/ride.service';
import { UserService } from '../services/user.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit {
  activeBookings: Ride[] = [];
  pastBookings: Ride[] = [];
  displayedActiveBookings: Ride[] = [];
  displayedPastBookings: Ride[] = [];
  isLoading = false;
  isActive = true;
  
  // Pagination settings
  private readonly INITIAL_DISPLAY_COUNT = 4;
  private readonly LOAD_MORE_COUNT = 5;
  activeDisplayCount = 0;
  pastDisplayCount = 0;

  constructor(
    private rideService: RideService,
    private userService: UserService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadRides();
  }

  async ionViewDidEnter() {
    await this.loadRides();
  }

  async loadRides() {
    try {
      this.isLoading = true;
      
      // Get current user
      const user = await firstValueFrom(this.userService.user$);
      if (!user || !user.isLoggedIn || !user._id) {
        console.log('User not logged in, cannot fetch rides');
        this.activeBookings = [];
        this.pastBookings = [];
        this.isLoading = false;
        return;
      }

      // Fetch rides from API
      const rides = await firstValueFrom(
        this.rideService.getUserRides(user._id)
      );

      // Filter rides into active and past
      this.activeBookings = rides.filter(
        (ride) =>
          ride.status === 'requested' ||
          ride.status === 'accepted' ||
          ride.status === 'in_progress'
      );

      this.pastBookings = rides.filter(
        (ride) =>
          ride.status === 'completed' || ride.status === 'cancelled'
      );

      // Sort by date (newest first)
      this.activeBookings.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      this.pastBookings.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Reset display counts and show initial rides
      this.activeDisplayCount = 0;
      this.pastDisplayCount = 0;
      this.updateDisplayedRides();
    } catch (error) {
      console.error('Error loading rides:', error);
      this.activeBookings = [];
      this.pastBookings = [];
      this.displayedActiveBookings = [];
      this.displayedPastBookings = [];
    } finally {
      this.isLoading = false;
    }
  }

  updateDisplayedRides() {
    // Update displayed active bookings
    const nextActiveCount = Math.min(
      this.activeDisplayCount + (this.activeDisplayCount === 0 ? this.INITIAL_DISPLAY_COUNT : this.LOAD_MORE_COUNT),
      this.activeBookings.length
    );
    this.displayedActiveBookings = this.activeBookings.slice(0, nextActiveCount);
    this.activeDisplayCount = nextActiveCount;

    // Update displayed past bookings
    const nextPastCount = Math.min(
      this.pastDisplayCount + (this.pastDisplayCount === 0 ? this.INITIAL_DISPLAY_COUNT : this.LOAD_MORE_COUNT),
      this.pastBookings.length
    );
    this.displayedPastBookings = this.pastBookings.slice(0, nextPastCount);
    this.pastDisplayCount = nextPastCount;
  }

  loadMoreActive() {
    const nextCount = Math.min(
      this.activeDisplayCount + this.LOAD_MORE_COUNT,
      this.activeBookings.length
    );
    this.displayedActiveBookings = this.activeBookings.slice(0, nextCount);
    this.activeDisplayCount = nextCount;
  }

  loadMorePast() {
    const nextCount = Math.min(
      this.pastDisplayCount + this.LOAD_MORE_COUNT,
      this.pastBookings.length
    );
    this.displayedPastBookings = this.pastBookings.slice(0, nextCount);
    this.pastDisplayCount = nextCount;
  }

  hasMoreActive(): boolean {
    return this.activeDisplayCount < this.activeBookings.length;
  }

  hasMorePast(): boolean {
    return this.pastDisplayCount < this.pastBookings.length;
  }

  segmentChanged(event: any) {
    if (event.detail.value === 'active') {
      this.isActive = true;
    } else {
      this.isActive = false;
    }
  }

  navigateToActiveRide(rideId: string) {
    this.router.navigate(['/active-ordere', rideId]);
  }

  formatDate(date: Date | string): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatTime(date: Date | string): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'requested':
      case 'accepted':
      case 'in_progress':
        return 'success';
      case 'completed':
        return 'primary';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'requested':
        return 'Requested';
      case 'accepted':
        return 'Accepted';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  getDriverName(ride: Ride): string {
    return ride.driver?.name || 'Not assigned';
  }

  getVehicleInfo(ride: Ride): string {
    if (!ride.driver?.vehicleInfo) return 'N/A';
    const { color, make, model } = ride.driver.vehicleInfo;
    return `${color} ${make} ${model}`;
  }

  callDriver(phone?: string) {
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      console.log('Driver phone number not available');
    }
  }
}
