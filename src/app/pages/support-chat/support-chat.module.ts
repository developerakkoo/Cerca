import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SupportChatPageRoutingModule } from './support-chat-routing.module';

import { SupportChatPage } from './support-chat.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SupportChatPageRoutingModule
  ],
  declarations: [SupportChatPage]
})
export class SupportChatPageModule {}
