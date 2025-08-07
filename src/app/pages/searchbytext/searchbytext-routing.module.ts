import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SearchbytextPage } from './searchbytext.page';

const routes: Routes = [
  {
    path: '',
    component: SearchbytextPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SearchbytextPageRoutingModule {}
