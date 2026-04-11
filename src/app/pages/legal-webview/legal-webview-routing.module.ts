import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LegalWebviewPage } from './legal-webview.page';

const routes: Routes = [
  {
    path: '',
    component: LegalWebviewPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LegalWebviewPageRoutingModule {}
