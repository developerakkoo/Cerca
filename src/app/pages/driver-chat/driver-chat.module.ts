import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DriverChatPageRoutingModule } from './driver-chat-routing.module';

import { DriverChatPage } from './driver-chat.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DriverChatPageRoutingModule
  ],
  declarations: [DriverChatPage]
})
export class DriverChatPageModule {}
