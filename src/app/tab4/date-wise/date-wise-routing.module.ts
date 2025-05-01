import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DateWisePage } from './date-wise.page';

const routes: Routes = [
  {
    path: '',
    component: DateWisePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DateWisePageRoutingModule {}
