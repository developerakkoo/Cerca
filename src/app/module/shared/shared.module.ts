import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicModule } from '@ionic/angular';
import { ModalComponent } from 'src/app/components/modal/modal.component';



@NgModule({
  declarations: [],
  imports: [
    IonicModule,
    CommonModule,
    HeaderComponent,
    ModalComponent
  ],
  exports: [HeaderComponent,ModalComponent]
})
export class SharedModule { }
