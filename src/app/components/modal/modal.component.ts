import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HeaderComponent } from '../header/header.component';
interface Address {
  type: string;
  address: string;
  isSelected: boolean;
}
@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
  standalone:true,
  imports:[IonicModule, CommonModule,FormsModule,HeaderComponent]
})
export class ModalComponent  implements OnInit {
  @Input() isLocationFetched = false;
  @Input() pickupInput: string = '';
  @Input() destinationInput: string = '';
  @Input() isKeyboardOpen: boolean = false;
  activeInput: 'pickup' | 'destination' | null = null;

  addresses: Address[] = [
    { type: 'Home', address: '123 Main St', isSelected: false },
    { type: 'Work', address: '456 Business Ave', isSelected: false },
    { type: 'Gym', address: '789 Fitness Rd', isSelected: false }
  ];

  constructor() {
  }

  ngOnInit() {}

  @HostListener('window:keyboardWillShow')
  onKeyboardShow() {
    this.isKeyboardOpen = true;
  }

  @HostListener('window:keyboardWillHide')
  onKeyboardHide() {
    this.isKeyboardOpen = false;
  }

  onFocus(_event: any, type: 'pickup' | 'destination') {
    this.activeInput = type;
  }

  onBlur(_event: any) {
    // Add a small delay to allow for click events to fire
    setTimeout(() => {
      this.activeInput = null;
    }, 200);
  }

  clearInput(type: 'pickup' | 'destination') {
    if (type === 'pickup') {
      this.pickupInput = '';
    } else {
      this.destinationInput = '';
    }
    
    // Reset selection state for all addresses
    this.addresses.forEach(addr => {
      addr.isSelected = false;
    });
  }

  toggleAddress(address: Address) {
    // If no input is active, use the last active input or default to pickup
    const targetInput = this.activeInput || 'pickup';
    
    // Reset all addresses first
    this.addresses.forEach(addr => {
      addr.isSelected = false;
    });
    
    // Toggle the selected address
    address.isSelected = !address.isSelected;
    
    // Update the appropriate input
    if (targetInput === 'pickup') {
      this.pickupInput = address.isSelected ? address.address : '';
    } else {
      this.destinationInput = address.isSelected ? address.address : '';
    }
  }
}
