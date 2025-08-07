import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SearchbytextPageRoutingModule } from './searchbytext-routing.module';
import { SearchbytextPage } from './searchbytext.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SearchbytextPageRoutingModule
  ],
  declarations: [SearchbytextPage]
})
export class SearchbytextPageModule {}
