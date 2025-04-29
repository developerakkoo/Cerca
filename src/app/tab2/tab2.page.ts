import { Component } from '@angular/core';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page {
  booking = {
    id: '12345',
    driverName: 'John Doe',
    carType: 'Sedan',
    pickupLocation: '123 Main St',
    dropLocation: '456 Elm St',
    estimatedArrivalTime: '10:30 AM',
    status: 'Active', // Can be 'Active' or 'Completed'
  };
  activeBookings: any[] = [];
  pastBookings: any[] = [];

  isActive = true;
  constructor() {}


  ionViewDidEnter() {
    this.activeBookings = this.getActiveBookings();
    this.pastBookings = this.getPastBookings();
  }

  segmentChanged(event: any) {
    console.log(event);
    if (event.detail.value === 'active') {
      this.isActive = true;
      this.activeBookings = this.getActiveBookings();
    } else {
      this.isActive = false;
      this.pastBookings = this.getPastBookings();
    }
  }

  getActiveBookings() {
    return [{
      id: '12345',
      driverName: 'John Doe',
      carType: 'Sedan',
      pickupLocation: '123 Main St',
      dropLocation: '456 Elm St',
      estimatedArrivalTime: '10:30 AM',
      status: 'Active', // Can be 'Active' or 'Completed'
    }];
  }

  getPastBookings() {
    return [{
      id: '12345',
      driverName: 'John Doe',
      carType: 'Sedan',
      pickupLocation: '123 Main St',
      dropLocation: '456 Elm St',
      estimatedArrivalTime: '10:30 AM',
      status: 'Completed', // Can be 'Active' or 'Completed'
    },
    {
      id: '12345',
      driverName: 'John Doe',
      carType: 'Sedan',
      pickupLocation: '123 Main St',
      dropLocation: '456 Elm St',
      estimatedArrivalTime: '10:30 AM',
      status: 'Completed', // Can be 'Active' or 'Completed'
    }];
  }

  callDriver() {
    console.log('callDriver');
  }
}
