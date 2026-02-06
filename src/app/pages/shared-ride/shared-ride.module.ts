import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedRidePageRoutingModule } from './shared-ride-routing.module';
import { SharedRidePage } from './shared-ride.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedRidePageRoutingModule
  ],
  declarations: [SharedRidePage]
})
export class SharedRidePageModule {}

