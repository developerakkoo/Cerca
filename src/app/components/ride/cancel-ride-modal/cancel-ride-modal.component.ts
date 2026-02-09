import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

export interface CancelReason {
  value: string;
  label: string;
  description?: string;
}

@Component({
  selector: 'app-cancel-ride-modal',
  templateUrl: './cancel-ride-modal.component.html',
  styleUrls: ['./cancel-ride-modal.component.scss'],
})
export class CancelRideModalComponent implements OnInit {
  @Input() isOpen: boolean = false;
  @Output() dismissed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<{ reason: string; notes?: string }>();

  selectedReason: string = '';
  additionalNotes: string = '';

  cancelReasons: CancelReason[] = [
    {
      value: 'driver_taking_too_long',
      label: 'Driver taking too long',
      description: 'The driver is taking longer than expected'
    },
    {
      value: 'changed_plans',
      label: 'Changed my plans',
      description: 'I no longer need this ride'
    },
    {
      value: 'found_another_ride',
      label: 'Found another ride',
      description: 'I booked a different ride'
    },
    {
      value: 'wrong_pickup_location',
      label: 'Wrong pickup location',
      description: 'I entered the wrong address'
    },
    {
      value: 'price_too_high',
      label: 'Price too high',
      description: 'The fare is higher than expected'
    },
    {
      value: 'other',
      label: 'Other reason',
      description: 'Something else'
    }
  ];

  constructor() {}

  ngOnInit() {}

  onReasonChange(event: any) {
    this.selectedReason = event.detail.value;
  }

  onDismiss() {
    this.isOpen = false;
    this.dismissed.emit();
    this.reset();
  }

  onCancel() {
    this.onDismiss();
  }

  onConfirm() {
    if (!this.selectedReason) {
      return;
    }

    this.cancelled.emit({
      reason: this.selectedReason,
      notes: this.additionalNotes.trim() || undefined
    });

    this.reset();
    this.isOpen = false;
  }

  private reset() {
    this.selectedReason = '';
    this.additionalNotes = '';
  }
}
