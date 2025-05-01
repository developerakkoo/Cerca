import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ActiveOrderePageRoutingModule } from './active-ordere-routing.module';

import { ActiveOrderePage } from './active-ordere.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ActiveOrderePageRoutingModule
  ],
  declarations: [ActiveOrderePage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ActiveOrderePageModule {}
