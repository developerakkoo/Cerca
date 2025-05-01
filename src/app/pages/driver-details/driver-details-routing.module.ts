import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DriverDetailsPage } from './driver-details.page';

const routes: Routes = [
  {
    path: '',
    component: DriverDetailsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DriverDetailsPageRoutingModule {}
