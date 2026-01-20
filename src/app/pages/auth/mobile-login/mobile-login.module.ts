import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { MobileLoginPageRoutingModule } from './mobile-login-routing.module';

import { MobileLoginPage } from './mobile-login.page';
import { ReactiveFormsModule } from '@angular/forms';
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    TranslateModule,
    MobileLoginPageRoutingModule
  ],
  declarations: [MobileLoginPage]
})
export class MobileLoginPageModule {}
