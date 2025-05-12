import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ProfileDetailsPageRoutingModule } from './profile-details-routing.module';

import { ProfileDetailsPage } from './profile-details.page';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IonicModule,
    ProfileDetailsPageRoutingModule
  ],
  declarations: [ProfileDetailsPage]
})
export class ProfileDetailsPageModule {}
