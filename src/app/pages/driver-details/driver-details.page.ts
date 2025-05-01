import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

interface DriverDetails {
  name: string;
  photo: string;
  rating: number;
  totalTrips: number;
  experience: number;
  membershipDuration: string;
  carType: string;
  carNumber: string;
}

@Component({
  selector: 'app-driver-details',
  templateUrl: './driver-details.page.html',
  styleUrls: ['./driver-details.page.scss'],
  standalone: false,
})
export class DriverDetailsPage implements OnInit {
  driverDetails: DriverDetails = {
    name: 'John Doe',
    photo: 'assets/images/driver-avatar.jpg',
    rating: 4.8,
    totalTrips: 1250,
    experience: 5,
    membershipDuration: '3 years',
    carType: 'Toyota Camry',
    carNumber: 'MH 12 AB 1234'
  };

  constructor(private router: Router) {}

  ngOnInit() {
    // In a real app, you would fetch driver details from a service
    // this.loadDriverDetails();
  }

  callDriver() {
    // Implement call functionality
    console.log('Calling driver...');
  }

  chatWithDriver() {
    // Implement chat functionality
    console.log('Opening chat...');
  }

  goBack() {
    this.router.navigate(['/tabs/tab1']);
  }
}
