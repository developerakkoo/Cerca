import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';

import { ChooseTripModal } from './choose-trip.modal';
import { MoneyDisplayModule } from 'src/app/pipes/money-display.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    MoneyDisplayModule,
  ],
  declarations: [ChooseTripModal],
  exports: [ChooseTripModal], // Export so it can be used as modal component
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChooseTripModalModule {}

