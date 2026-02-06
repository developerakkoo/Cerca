import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChooseTripModal } from './choose-trip.modal';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
  ],
  declarations: [ChooseTripModal],
  exports: [ChooseTripModal], // Export so it can be used as modal component
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChooseTripModalModule {}

