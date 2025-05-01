import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: false,
})
export class SplashPage implements OnInit {
  showTransition = false;

  constructor(private router: Router) {}

  ngOnInit() {
    // Start transition after 2 seconds
    setTimeout(() => {
      this.showTransition = true;
      
      // Navigate after transition animation completes
      setTimeout(() => {
        this.router.navigate(['/welcome']);
      }, 500); // Half second for the transition animation
    }, 2000);
  }
}
