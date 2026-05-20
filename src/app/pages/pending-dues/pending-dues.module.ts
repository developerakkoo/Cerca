import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PendingDuesPageRoutingModule } from './pending-dues-routing.module';
import { PendingDuesPage } from './pending-dues.page';
import { MoneyDisplayModule } from 'src/app/pipes/money-display.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, MoneyDisplayModule, PendingDuesPageRoutingModule],
  declarations: [PendingDuesPage],
})
export class PendingDuesPageModule {}
