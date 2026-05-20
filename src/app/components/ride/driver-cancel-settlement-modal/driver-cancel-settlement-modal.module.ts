import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { DriverCancelSettlementModalComponent } from './driver-cancel-settlement-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [DriverCancelSettlementModalComponent],
  exports: [DriverCancelSettlementModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverCancelSettlementModalModule {}
