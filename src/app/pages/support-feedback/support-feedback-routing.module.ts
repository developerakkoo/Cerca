import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SupportFeedbackPage } from './support-feedback.page';

const routes: Routes = [
  {
    path: '',
    component: SupportFeedbackPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SupportFeedbackPageRoutingModule {}
