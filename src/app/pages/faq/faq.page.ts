import { Component, OnInit } from '@angular/core';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  icon: string;
  items: FAQItem[];
}

@Component({
  selector: 'app-faq',
  templateUrl: './faq.page.html',
  styleUrls: ['./faq.page.scss'],
  standalone: false,
})
export class FAQPage implements OnInit {
  faqCategories: FAQCategory[] = [
    {
      title: 'Getting Started',
      icon: 'rocket-outline',
      items: [
        {
          question: 'How do I create an account?',
          answer: 'You can create an account by clicking on "Sign Up" on the login screen. You can register using your phone number or email address. You will receive an OTP for verification.'
        },
        {
          question: 'How do I verify my phone number?',
          answer: 'After entering your phone number, you will receive an OTP via SMS. Enter the OTP code in the verification screen to complete your registration.'
        },
        {
          question: 'Can I use the app without an account?',
          answer: 'No, you need to create an account to book rides. This ensures your safety and allows us to provide you with ride history and support.'
        },
        {
          question: 'What information do I need to provide?',
          answer: 'You need to provide your name, phone number, and email address. You can also add a profile picture and save your frequently used addresses for faster booking.'
        }
      ]
    },
    {
      title: 'Booking a Ride',
      icon: 'car-outline',
      items: [
        {
          question: 'How do I book a ride?',
          answer: 'Open the app and select your pickup location on the map. Then select your destination. Choose your vehicle type (Sedan, SUV, or Auto) and payment method. Tap "Book Ride" to confirm.'
        },
        {
          question: 'Can I book a ride in advance?',
          answer: 'Yes! We support instant booking as well as scheduled rides. You can book rides for specific dates and times using the "Schedule Ride" option.'
        },
        {
          question: 'How long does it take to find a driver?',
          answer: 'We typically find a nearby driver within 1-3 minutes. If no driver is available, we will notify you and you can try again later.'
        },
        {
          question: 'Can I cancel my ride?',
          answer: 'Yes, you can cancel your ride before the driver accepts it. Once a driver accepts, cancellation may incur a fee. You can cancel from the active ride screen or booking details.'
        },
        {
          question: 'What vehicle types are available?',
          answer: 'We offer three vehicle types: Sedan (comfortable 4-seater), SUV (spacious 6-seater), and Auto (affordable 3-wheeler). Prices vary by vehicle type.'
        }
      ]
    },
    {
      title: 'During the Ride',
      icon: 'navigate-outline',
      items: [
        {
          question: 'How do I track my driver?',
          answer: 'Once your ride is accepted, you can see your driver\'s real-time location on the map. The app shows the driver\'s route to your pickup location and estimated arrival time.'
        },
        {
          question: 'What is the OTP for?',
          answer: 'OTP (One-Time Password) ensures your safety. You receive a START OTP when the driver arrives, and a STOP OTP when you reach your destination. Share these OTPs with your driver to verify the ride.'
        },
        {
          question: 'Can I contact my driver?',
          answer: 'Yes! You can call or chat with your driver directly from the app. Use the call button or chat icon on the active ride screen to communicate with your driver.'
        },
        {
          question: 'What should I do if the driver doesn\'t arrive?',
          answer: 'If your driver doesn\'t arrive within the estimated time, you can contact them via call or chat. If there\'s an issue, you can cancel the ride and book a new one.'
        },
        {
          question: 'Can I change my destination during the ride?',
          answer: 'Currently, you cannot change the destination once the ride has started. Please ensure you enter the correct destination before confirming your booking.'
        }
      ]
    },
    {
      title: 'Payment & Pricing',
      icon: 'wallet-outline',
      items: [
        {
          question: 'What payment methods are accepted?',
          answer: 'We accept Cash, Razorpay (online payment), and Wallet payments. You can choose your preferred payment method when booking a ride.'
        },
        {
          question: 'How is the fare calculated?',
          answer: 'Fare is calculated based on distance, time, and vehicle type. You can see the estimated fare before confirming your booking. The final fare may vary slightly based on actual route taken.'
        },
        {
          question: 'Can I pay with my wallet?',
          answer: 'Yes! You can add money to your wallet and use it to pay for rides. Wallet payments are instant and convenient. You can also use a combination of wallet and online payment.'
        },
        {
          question: 'What if I was charged incorrectly?',
          answer: 'If you notice any discrepancy in the fare, please contact our support team with your ride details. We will review and refund any incorrect charges within 24-48 hours.'
        },
        {
          question: 'Are there any cancellation fees?',
          answer: 'Cancellation fees may apply if you cancel after a driver has accepted your ride. The fee amount depends on the cancellation time and is clearly shown before you confirm cancellation.'
        },
        {
          question: 'Do you offer refunds?',
          answer: 'Yes, we process refunds for cancelled rides (if eligible), incorrect charges, or payment failures. Refunds are processed to your original payment method within 5-7 business days.'
        }
      ]
    },
    {
      title: 'Account & Settings',
      icon: 'settings-outline',
      items: [
        {
          question: 'How do I update my profile?',
          answer: 'Go to Settings (Profile tab) and tap on "Edit Profile". You can update your name, email, phone number, and profile picture from there.'
        },
        {
          question: 'How do I add money to my wallet?',
          answer: 'Go to the Wallet tab and tap "Add Money". Enter the amount and choose your payment method. You can add money using Razorpay or other supported payment gateways.'
        },
        {
          question: 'Can I save my favorite addresses?',
          answer: 'Yes! You can save frequently used addresses like home, office, or favorite locations. Go to Settings > Address to manage your saved addresses.'
        },
        {
          question: 'How do I change my language?',
          answer: 'Go to Settings and tap on "Language". Select your preferred language from the list. The app supports English, Hindi, and Marathi.'
        },
        {
          question: 'How do I enable/disable notifications?',
          answer: 'Go to Settings and toggle the "Notifications" switch. You can enable or disable ride updates, promotional notifications, and other alerts.'
        },
        {
          question: 'How do I view my ride history?',
          answer: 'Go to the Bookings tab and switch to "Past Bookings". You can see all your completed and cancelled rides with details like date, fare, and driver information.'
        }
      ]
    },
    {
      title: 'Troubleshooting',
      icon: 'help-circle-outline',
      items: [
        {
          question: 'The app is not finding drivers nearby',
          answer: 'This could happen if there are no available drivers in your area. Try again after a few minutes, or expand your search radius. You can also try booking during peak hours when more drivers are available.'
        },
        {
          question: 'I\'m not receiving OTP',
          answer: 'Check your phone\'s SMS settings and ensure you have network connectivity. If the issue persists, try requesting OTP again or contact support for assistance.'
        },
        {
          question: 'The map is not loading',
          answer: 'Check your internet connection and ensure location services are enabled. Try closing and reopening the app, or restart your device if the problem continues.'
        },
        {
          question: 'Payment failed but money was deducted',
          answer: 'Don\'t worry! If payment fails but money is deducted, it will be automatically refunded within 24-48 hours. If not, contact support with your transaction ID for immediate assistance.'
        },
        {
          question: 'I can\'t see my active ride after refreshing',
          answer: 'The app automatically syncs your ride state. If you don\'t see your active ride, try navigating to the Bookings tab. If the issue persists, contact support with your ride ID.'
        },
        {
          question: 'How do I report a problem with my ride?',
          answer: 'After completing your ride, you can rate your driver and leave feedback. For serious issues, contact our support team through the app or email. We take all reports seriously and will investigate promptly.'
        },
        {
          question: 'The app keeps crashing',
          answer: 'Try clearing the app cache, updating to the latest version, or reinstalling the app. If the problem continues, contact support with details about when the crashes occur.'
        }
      ]
    }
  ];

  expandedItems: Set<number> = new Set();
  searchQuery: string = '';
  filteredCategories: FAQCategory[] = [];

  constructor() {}

  ngOnInit() {
    this.filteredCategories = this.faqCategories;
  }

  toggleItem(categoryIndex: number, itemIndex: number): void {
    const key = `${categoryIndex}-${itemIndex}`;
    const numericKey = categoryIndex * 1000 + itemIndex;
    
    if (this.expandedItems.has(numericKey)) {
      this.expandedItems.delete(numericKey);
    } else {
      this.expandedItems.add(numericKey);
    }
  }

  isExpanded(categoryIndex: number, itemIndex: number): boolean {
    const numericKey = categoryIndex * 1000 + itemIndex;
    return this.expandedItems.has(numericKey);
  }

  onSearchChange(event: any): void {
    this.searchQuery = event.detail.value.toLowerCase().trim();
    this.filterFAQs();
  }

  filterFAQs(): void {
    if (!this.searchQuery) {
      this.filteredCategories = this.faqCategories;
      return;
    }

    this.filteredCategories = this.faqCategories.map(category => {
      const filteredItems = category.items.filter(item =>
        item.question.toLowerCase().includes(this.searchQuery) ||
        item.answer.toLowerCase().includes(this.searchQuery)
      );

      return {
        ...category,
        items: filteredItems
      };
    }).filter(category => category.items.length > 0);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredCategories = this.faqCategories;
  }

  contactSupport(): void {
    const email = 'cercacabservices@gmail.com';
    const subject = 'Support Request - Cerca Cab Services';
    const body = 'Hello,\n\nI need assistance with:\n\n';
    
    // Create mailto link
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Open default email app
    window.location.href = mailtoLink;
  }
}

