import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CabSearchingPageRoutingModule } from './cab-searching-routing.module';

import { CabSearchingPage } from './cab-searching.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CabSearchingPageRoutingModule
  ],
  declarations: [CabSearchingPage]
})
export class CabSearchingPageModule {}
