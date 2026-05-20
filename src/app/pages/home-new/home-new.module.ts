import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HomeNewPage } from './home-new.page';
import { HomeNewPageRoutingModule } from './home-new-routing.module';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { MoneyDisplayModule } from 'src/app/pipes/money-display.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule,
    MoneyDisplayModule,
    HomeNewPageRoutingModule
  ],
  declarations: [HomeNewPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  exports: [HomeNewPage]
})
export class HomeNewPageModule {}

