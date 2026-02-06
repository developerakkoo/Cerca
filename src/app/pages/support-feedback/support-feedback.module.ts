import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SupportFeedbackPageRoutingModule } from './support-feedback-routing.module';

import { SupportFeedbackPage } from './support-feedback.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SupportFeedbackPageRoutingModule
  ],
  declarations: [SupportFeedbackPage]
})
export class SupportFeedbackPageModule {}
