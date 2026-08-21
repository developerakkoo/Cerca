import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';

/**
 * Cold-start gate: read local session and route before Login paints.
 * No artificial delay — only Ionic Storage I/O.
 */
@Component({
  selector: 'app-bootstrap',
  templateUrl: './bootstrap.page.html',
  styleUrls: ['./bootstrap.page.scss'],
  standalone: false,
})
export class BootstrapPage implements OnInit {
  constructor(
    private router: Router,
    private userService: UserService,
  ) {}

  async ngOnInit() {
    try {
      const hasCredentials = await this.userService.hasStoredCredentials();
      if (hasCredentials) {
        const restored = await this.userService.restoreSession();
        if (restored) {
          await this.userService.loadUserFromStorage();
          await this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
          return;
        }
      }
      await this.userService.loadUserFromStorage();
      await this.router.navigate(['/mobile-login'], { replaceUrl: true });
    } catch (e) {
      console.error('Bootstrap session check failed:', e);
      await this.router.navigate(['/mobile-login'], { replaceUrl: true });
    }
  }
}
