import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone:true,
  imports:[IonicModule,CommonModule]
})
export class HeaderComponent  implements OnInit {
  @Input() showNotificationDot = false;
  constructor(private router:Router) { }

  ngOnInit() {}


  handleButtonClick(index: number) {
    if(index === 0){
      this.router.navigate(['/searchbytext']);
    } else if(index === 1){
      this.router.navigate(['/gift']);
    } else if(index === 2){
      this.router.navigate(['/notifications']);
    }
  }
}
