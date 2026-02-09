import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { RidePaymentPageRoutingModule } from './ride-payment-routing.module';
import { RidePaymentPage } from './ride-payment.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RidePaymentPageRoutingModule
  ],
  declarations: [RidePaymentPage]
})
export class RidePaymentPageModule {}
