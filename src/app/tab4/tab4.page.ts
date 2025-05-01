import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';
import { Router } from '@angular/router';
interface Service {
  id: number;
  name: string;
  description: string;
  price: number;
  duration: string;
  icon: string;
}

interface Booking {
  serviceId: number;
  startDate: Date;
  endDate: Date;
  type: 'fullDay' | 'rental' | 'dateWise';
}

@Component({
  selector: 'app-tab4',
  templateUrl: './tab4.page.html',
  styleUrls: ['./tab4.page.scss'],
  standalone: false,
})
export class Tab4Page implements OnInit {
  services: Service[] = [
    {
      id: 1,
      name: 'Full Day Cab',
      description: 'Book a cab for the entire day',
      price: 1500,
      duration: '24 hours',
      icon: 'car-outline'
    },
    {
      id: 2,
      name: 'Rental Service',
      description: 'Long-term cab rental service',
      price: 5000,
      duration: '7 days',
      icon: 'time-outline'
    },
    {
      id: 3,
      name: 'Date-wise Booking',
      description: 'Book for specific dates',
      price: 2000,
      duration: 'Custom',
      icon: 'calendar-outline'
    }
  ];

  selectedService: Service | null = null;
  selectedBookingType: 'fullDay' | 'rental' | 'dateWise' = 'fullDay';
  startDate: string = '';
  endDate: string = '';
  minDate: string = new Date().toISOString();
  maxDate: string = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString();

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform,
    private router: Router
  ) {}

  ngOnInit() {
    this.animateServices();
  }

  private animateServices() {
    const elements = document.querySelectorAll('.service-card');
    elements.forEach((element, index) => {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(300)
        .easing('ease-out')
        .fromTo('transform', 'translateY(20px)', 'translateY(0)')
        .fromTo('opacity', '0', '1')
        .delay(index * 100);

      animation.play();
    });
  }

  selectService(service: Service) {
    this.selectedService = service;
    this.animateSelection(service.id);
    if (service.id === 3) {
      this.router.navigate(['/tabs/tabs/tab4/date-wise']);
    }
  }

  private animateSelection(serviceId: number) {
    const element = document.querySelector(`#service-${serviceId}`);
    if (element) {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(200)
        .easing('ease-out')
        .keyframes([
          { offset: 0, transform: 'scale(1)' },
          { offset: 0.5, transform: 'scale(1.05)' },
          { offset: 1, transform: 'scale(1)' }
        ]);

      animation.play();
    }
  }

  calculateTotal(): number {
    if (!this.selectedService) return 0;

    let total = this.selectedService.price;
    if (this.selectedBookingType === 'dateWise' && this.startDate && this.endDate) {
      const days = Math.ceil((new Date(this.endDate).getTime() - new Date(this.startDate).getTime()) / (1000 * 60 * 60 * 24));
      total *= days;
    }

    return total;
  }

  bookService() {
    if (!this.selectedService) return;

    const booking: Booking = {
      serviceId: this.selectedService.id,
      startDate: new Date(this.startDate),
      endDate: new Date(this.endDate),
      type: this.selectedBookingType
    };

    // Implement booking logic
    console.log('Booking:', booking);
  }
}
