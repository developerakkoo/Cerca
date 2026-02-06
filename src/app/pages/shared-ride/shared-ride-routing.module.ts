import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SharedRidePage } from './shared-ride.page';

const routes: Routes = [
  {
    path: '',
    component: SharedRidePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SharedRidePageRoutingModule {}

