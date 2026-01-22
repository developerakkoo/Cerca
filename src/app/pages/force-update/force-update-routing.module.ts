import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ForceUpdatePage } from './force-update.page';

const routes: Routes = [
  {
    path: '',
    component: ForceUpdatePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ForceUpdatePageRoutingModule {}

