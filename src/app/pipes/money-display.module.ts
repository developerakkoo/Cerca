import { NgModule } from '@angular/core';
import { InrWholePipe } from './inr-whole.pipe';

@NgModule({
  imports: [InrWholePipe],
  exports: [InrWholePipe],
})
export class MoneyDisplayModule {}
