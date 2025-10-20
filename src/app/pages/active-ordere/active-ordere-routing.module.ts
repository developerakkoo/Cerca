import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ActiveOrderePage } from './active-ordere.page';

const routes: Routes = [
  {
    path: '',
    component: ActiveOrderePage
  },
  {
    path: ':rideId',
    component: ActiveOrderePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ActiveOrderePageRoutingModule {}
