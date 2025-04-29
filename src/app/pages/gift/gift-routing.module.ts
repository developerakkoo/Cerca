import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { GiftPage } from './gift.page';

const routes: Routes = [
  {
    path: '',
    component: GiftPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GiftPageRoutingModule {}
