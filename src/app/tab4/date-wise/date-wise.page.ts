import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-date-wise',
  templateUrl: './date-wise.page.html',
  styleUrls: ['./date-wise.page.scss'],
  standalone: false,
})
export class DateWisePage implements OnInit {
  bookingType: 'single' | 'multiple' = 'single';
  selectedDates: string[] = [];
  selectedTime: string | null = null;
  pickupLocation: string = '';
  dropLocation: string = '';
  minDate = new Date().toISOString();

  timeSlots: string[] = [
    '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM',
    '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
    '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'
  ];

  constructor(private navCtrl: NavController) {}

  ngOnInit() {}

  setBookingType(type: 'single' | 'multiple') {
    this.bookingType = type;
    this.selectedDates = [];
  }

  onDateSelect(event: any) {
    const value = event.detail.value;
    if (this.bookingType === 'single') {
      this.selectedDates = [value];
    } else {
      this.selectedDates = Array.isArray(value) ? value : [value];
    }
  }

  selectTime(time: string) {
    this.selectedTime = time;
  }

  removeDate(date: string) {
    this.selectedDates = this.selectedDates.filter(d => d !== date);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }

  isFormValid(): boolean {
    return (
      this.selectedDates.length > 0 &&
      this.selectedTime !== null &&
      this.pickupLocation.trim() !== '' &&
      this.dropLocation.trim() !== ''
    );
  }

  goBack() {
    this.navCtrl.back();
  }

  async bookRide() {
    if (!this.isFormValid()) return;

    try {
      // Here you would typically make an API call to book the ride
      const bookingData = {
        dates: this.selectedDates,
        time: this.selectedTime,
        pickup: this.pickupLocation,
        drop: this.dropLocation
      };

      console.log('Booking data:', bookingData);
      
      // Show success message and navigate back
      // You can replace this with your actual implementation
      alert('Booking successful!');
      this.navCtrl.back();
    } catch (error) {
      console.error('Booking failed:', error);
      alert('Failed to book ride. Please try again.');
    }
  }
}
