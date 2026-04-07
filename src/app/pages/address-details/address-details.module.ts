import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { AddressDetailsPageRoutingModule } from './address-details-routing.module';

import { AddressDetailsPage } from './address-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TranslateModule,
    AddressDetailsPageRoutingModule
  ],
  declarations: [AddressDetailsPage]
})
export class AddressDetailsPageModule {}
