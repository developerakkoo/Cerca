import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RidePaymentPage } from './ride-payment.page';

const routes: Routes = [
  {
    path: '',
    component: RidePaymentPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RidePaymentPageRoutingModule {}
