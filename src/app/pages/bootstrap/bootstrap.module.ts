import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { BootstrapPageRoutingModule } from './bootstrap-routing.module';
import { BootstrapPage } from './bootstrap.page';

@NgModule({
  imports: [CommonModule, IonicModule, BootstrapPageRoutingModule],
  declarations: [BootstrapPage],
})
export class BootstrapPageModule {}
