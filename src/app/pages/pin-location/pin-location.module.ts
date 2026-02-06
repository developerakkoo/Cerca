import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PinLocationPageRoutingModule } from './pin-location-routing.module';

import { PinLocationPage } from './pin-location.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PinLocationPageRoutingModule
  ],
  declarations: [PinLocationPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PinLocationPageModule {}

