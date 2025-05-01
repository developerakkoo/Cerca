import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DriverDetailsPageRoutingModule } from './driver-details-routing.module';

import { DriverDetailsPage } from './driver-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DriverDetailsPageRoutingModule
  ],
  declarations: [DriverDetailsPage]
})
export class DriverDetailsPageModule {}
