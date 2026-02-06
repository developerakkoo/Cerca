import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SupportListPageRoutingModule } from './support-list-routing.module';

import { SupportListPage } from './support-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SupportListPageRoutingModule
  ],
  declarations: [SupportListPage]
})
export class SupportListPageModule {}
