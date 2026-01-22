import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ForceUpdatePageRoutingModule } from './force-update-routing.module';
import { ForceUpdatePage } from './force-update.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ForceUpdatePageRoutingModule
  ],
  declarations: [ForceUpdatePage]
})
export class ForceUpdatePageModule {}

