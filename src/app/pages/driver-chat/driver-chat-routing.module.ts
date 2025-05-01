import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DriverChatPage } from './driver-chat.page';

const routes: Routes = [
  {
    path: '',
    component: DriverChatPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DriverChatPageRoutingModule {}
