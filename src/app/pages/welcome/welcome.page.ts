import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
  standalone: false,
})
export class WelcomePage implements OnInit {

  timeOut:any;
  constructor(private router: Router) { }

  ngOnInit() {
    // Any additional initialization logic can be added here
    this.timeOut = setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3000);
  }

}
