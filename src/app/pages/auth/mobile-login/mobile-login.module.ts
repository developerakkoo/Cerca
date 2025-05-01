import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MobileLoginPageRoutingModule } from './mobile-login-routing.module';

import { MobileLoginPage } from './mobile-login.page';
import { ReactiveFormsModule } from '@angular/forms';
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    MobileLoginPageRoutingModule
  ],
  declarations: [MobileLoginPage]
})
export class MobileLoginPageModule {}
