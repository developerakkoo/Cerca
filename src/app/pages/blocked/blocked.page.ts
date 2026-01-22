import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-blocked',
  templateUrl: './blocked.page.html',
  styleUrls: ['./blocked.page.scss'],
  standalone: false,
})
export class BlockedPage implements OnInit {

  constructor(
    private router: Router,
    private location: Location
  ) { }

  ngOnInit() {
    // Prevent back navigation
    this.location.replaceState('/blocked');
    
    // Prevent any navigation attempts
    this.router.events.subscribe((event) => {
      // Keep user on blocked screen
      if (this.router.url !== '/blocked') {
        this.router.navigate(['/blocked']);
      }
    });
  }

  // Prevent any navigation away from this screen
  ionViewWillEnter() {
    // Ensure we stay on blocked screen
    if (this.router.url !== '/blocked') {
      this.router.navigate(['/blocked'], { replaceUrl: true });
    }
  }
}

