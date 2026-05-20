import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { ActiveOrderePageRoutingModule } from './active-ordere-routing.module';

import { ActiveOrderePage } from './active-ordere.page';
import { DriverChatPageModule } from '../driver-chat/driver-chat.module';
import { SearchPageModule } from '../search/search.module';
import { DriverCancelSettlementModalModule } from '../../components/ride/driver-cancel-settlement-modal/driver-cancel-settlement-modal.module';
import { MoneyDisplayModule } from 'src/app/pipes/money-display.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TranslateModule,
    MoneyDisplayModule,
    ActiveOrderePageRoutingModule,
    DriverChatPageModule, // Import chat module for modal usage
    SearchPageModule, // Modal: change destination (place search)
    // Inline-host the driver-cancel settlement modal so the lazy-loaded chunk
    // for this page has the component declared in its own scope. This avoids
    // the ModalController.create rendering regression that leaked the
    // template as raw text.
    DriverCancelSettlementModalModule
  ],
  declarations: [ActiveOrderePage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ActiveOrderePageModule {}
