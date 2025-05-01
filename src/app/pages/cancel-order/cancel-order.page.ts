import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cancel-order',
  templateUrl: './cancel-order.page.html',
  styleUrls: ['./cancel-order.page.scss'],
  standalone: false,
})
export class CancelOrderPage implements OnInit {
  showAlert = false;

  constructor(private router: Router) { }

  ngOnInit() {
  }

  submit() {
    console.log('submit');
    this.showAlert = true;
  }

  closeAlert() {
    this.showAlert = false;
    this.router.navigate(['/tabs/tab1']);
  }
}
