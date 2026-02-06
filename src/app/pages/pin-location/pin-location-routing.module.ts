import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PinLocationPage } from './pin-location.page';

const routes: Routes = [
  {
    path: '',
    component: PinLocationPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PinLocationPageRoutingModule {}

