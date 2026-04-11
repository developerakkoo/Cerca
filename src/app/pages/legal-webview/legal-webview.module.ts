import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { LegalWebviewPageRoutingModule } from './legal-webview-routing.module';
import { LegalWebviewPage } from './legal-webview.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    TranslateModule,
    LegalWebviewPageRoutingModule,
  ],
  declarations: [LegalWebviewPage],
})
export class LegalWebviewPageModule {}
