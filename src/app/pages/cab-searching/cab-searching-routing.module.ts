import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CabSearchingPage } from './cab-searching.page';

const routes: Routes = [
  {
    path: '',
    component: CabSearchingPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CabSearchingPageRoutingModule {}
