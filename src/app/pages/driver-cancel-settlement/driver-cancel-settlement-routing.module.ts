import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DriverCancelSettlementPage } from './driver-cancel-settlement.page';

const routes: Routes = [
  {
    path: '',
    component: DriverCancelSettlementPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DriverCancelSettlementPageRoutingModule {}
