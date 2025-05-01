import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  constructor(private router: Router) {}

  ngOnInit() {}

  // Social login methods
  async loginWithGoogle() {
    // Implement Google login
    console.log('Google login clicked');
  }

  async loginWithFacebook() {
    // Implement Facebook login
    console.log('Facebook login clicked');
  }

  async loginWithApple() {
    // Implement Apple login
    console.log('Apple login clicked');
  }

  // Navigate to mobile login
  goToMobileLogin() {
    this.router.navigate(['/mobile-login']);
  }

  // Navigate to registration
  goToRegister() {
    this.router.navigate(['/register']);
  }
}
