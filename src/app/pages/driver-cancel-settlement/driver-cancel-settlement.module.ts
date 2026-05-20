import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { DriverCancelSettlementPageRoutingModule } from './driver-cancel-settlement-routing.module';
import { DriverCancelSettlementPage } from './driver-cancel-settlement.page';
import { DriverCancelSettlementModalModule } from '../../components/ride/driver-cancel-settlement-modal/driver-cancel-settlement-modal.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    DriverCancelSettlementPageRoutingModule,
    DriverCancelSettlementModalModule,
  ],
  declarations: [DriverCancelSettlementPage],
})
export class DriverCancelSettlementPageModule {}
