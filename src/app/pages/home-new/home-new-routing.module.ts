import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeNewPage } from './home-new.page';

const routes: Routes = [
  {
    path: '',
    component: HomeNewPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomeNewPageRoutingModule {}

