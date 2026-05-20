import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Tab1Page } from './tab1.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { Tab1PageRoutingModule } from './tab1-routing.module';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { SharedModule } from '../module/shared/shared.module';
import { HomeNewPageModule } from '../pages/home-new/home-new.module';
import { DriverCancelSettlementModalModule } from '../components/ride/driver-cancel-settlement-modal/driver-cancel-settlement-modal.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule,
    ExploreContainerComponentModule,
    Tab1PageRoutingModule,
    SharedModule,
    HomeNewPageModule,
    // Cold-start fallback host: if the rider app launches with a pending
    // driver-cancel settlement and they're on tab1 (no active ride yet), the
    // inline <ion-modal> on tab1 still surfaces the styled modal.
    DriverCancelSettlementModalModule
  ],
  declarations: [Tab1Page],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Tab1PageModule {}
