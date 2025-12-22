import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ActiveOrderePageRoutingModule } from './active-ordere-routing.module';

import { ActiveOrderePage } from './active-ordere.page';
import { DriverChatPageModule } from '../driver-chat/driver-chat.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ActiveOrderePageRoutingModule,
    DriverChatPageModule // Import chat module for modal usage
  ],
  declarations: [ActiveOrderePage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ActiveOrderePageModule {}
