import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DateWisePageRoutingModule } from './date-wise-routing.module';

import { DateWisePage } from './date-wise.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DateWisePageRoutingModule
  ],
  declarations: [DateWisePage]
})
export class DateWisePageModule {}
