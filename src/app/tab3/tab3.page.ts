import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';

interface Transaction {
  id: number;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {
  balance: number = 1250.75;
  transactions: Transaction[] = [
    {
      id: 1,
      type: 'debit',
      amount: 500,
      description: 'Ride Payment',
      date: '2024-03-15',
      status: 'completed'
    },
    {
      id: 2,
      type: 'debit',
      amount: 250,
      description: 'Ride Payment',
      date: '2024-03-14',
      status: 'completed'
    },
    {
      id: 3,
      type: 'credit',
      amount: 1000,
      description: 'Wallet Top-up',
      date: '2024-03-13',
      status: 'completed'
    }
  ];

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform
  ) {}

  ngOnInit() {
    this.animateBalance();
  }

  private animateBalance() {
    const element = document.querySelector('.balance-amount');
    if (element) {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(1000)
        .easing('ease-out')
        .fromTo('transform', 'scale(0.8)', 'scale(1)')
        .fromTo('opacity', '0', '1');

      animation.play();
    }
  }

  addMoney() {
    // Implement add money logic
  }

  useMoney() {
    // Implement use money logic
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'danger';
      default:
        return 'medium';
    }
  }
}
