import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { DriverChatPageRoutingModule } from './driver-chat-routing.module';

import { DriverChatPage } from './driver-chat.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TranslateModule,
    DriverChatPageRoutingModule
  ],
  declarations: [DriverChatPage],
  exports: [DriverChatPage] // Export so it can be used in modals
})
export class DriverChatPageModule {}
