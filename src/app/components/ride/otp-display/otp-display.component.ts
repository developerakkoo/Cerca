import { Component, OnInit, Input } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-otp-display',
  templateUrl: './otp-display.component.html',
  styleUrls: ['./otp-display.component.scss'],
})
export class OtpDisplayComponent implements OnInit {
  @Input() otp: string = '';
  @Input() instruction: string = 'Share this OTP to start your ride';

  copied: boolean = false;

  constructor(private toastCtrl: ToastController) {}

  ngOnInit() {}

  async copyToClipboard() {
    if (!this.otp) {
      return;
    }

    try {
      // Use Clipboard API if available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(this.otp);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = this.otp;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      this.copied = true;
      
      const toast = await this.toastCtrl.create({
        message: 'OTP copied to clipboard',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();

      // Reset copied state after 2 seconds
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy OTP:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to copy OTP',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    }
  }
}
