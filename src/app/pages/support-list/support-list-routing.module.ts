import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SupportListPage } from './support-list.page';

const routes: Routes = [
  {
    path: '',
    component: SupportListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SupportListPageRoutingModule {}
