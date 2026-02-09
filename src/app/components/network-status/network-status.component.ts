import { Component, OnInit, OnDestroy } from '@angular/core';
import { NetworkService, NetworkStatus } from '../../services/network.service';
import { Subscription } from 'rxjs';
import { IonicModule } from '@ionic/angular';   
@Component({
  selector: 'app-network-status',
  template: `
    <div class="network-status" [class.visible]="showStatus" [class.poor]="isPoorConnection">
      <ion-icon [name]="statusIcon"></ion-icon>
      <span class="status-text">{{ statusMessage }}</span>
    </div>
  `,
  styles: [`
    .network-status {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 16px;
      padding-top: calc(8px + env(safe-area-inset-top));
      background: var(--ion-color-danger);
      color: var(--ion-color-danger-contrast);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transform: translateY(-100%);
      transition: transform 0.3s ease-in-out;
      z-index: 9999;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .network-status.visible {
      transform: translateY(0);
    }

    .network-status.poor {
      background: var(--ion-color-warning);
      color: var(--ion-color-warning-contrast);
    }

    .status-text {
      font-size: 14px;
      font-weight: 500;
    }

    ion-icon {
      font-size: 18px;
    }
  `],
  standalone:true,
  imports:[IonicModule]
})
export class NetworkStatusComponent implements OnInit, OnDestroy {
  showStatus = false;
  isPoorConnection = false;
  statusMessage = '';
  statusIcon = 'wifi-outline';
  private subscription: Subscription = new Subscription();
  private previousStatus: NetworkStatus | null = null;
  private hideTimer: any = null;

  constructor(private networkService: NetworkService) {}

  ngOnInit() {
    this.subscription = this.networkService.networkStatus$.subscribe(status => {
      this.updateStatus(status);
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }
  }

  private updateStatus(status: NetworkStatus) {
    // Only update if status actually changed
    if (this.previousStatus && 
        this.previousStatus.connected === status.connected &&
        this.previousStatus.connectionQuality === status.connectionQuality) {
      return; // No change, don't update UI
    }

    // Clear any existing hide timer
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (!status.connected) {
      // Show disconnected status immediately
      this.showStatus = true;
      this.isPoorConnection = false;
      this.statusMessage = 'No Internet Connection';
      this.statusIcon = 'cloud-offline-outline';
    } else if (status.connectionQuality === 'poor') {
      // Show poor connection warning
      this.showStatus = true;
      this.isPoorConnection = true;
      this.statusMessage = 'Poor Connection';
      this.statusIcon = 'wifi-outline';
    } else {
      // Connection is good - hide status with a slight delay to show "restored" message
      if (this.previousStatus && !this.previousStatus.connected) {
        // Was disconnected, now connected - show restored message briefly
        this.statusMessage = 'Connection Restored';
        this.statusIcon = 'checkmark-circle-outline';
        this.isPoorConnection = false;
        this.showStatus = true;
        
        // Hide after 3 seconds
        this.hideTimer = setTimeout(() => {
          this.showStatus = false;
        }, 3000);
      } else {
        // Already connected, just hide
        this.showStatus = false;
      }
    }

    this.previousStatus = { ...status };
  }
} 