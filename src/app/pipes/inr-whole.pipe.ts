import { Pipe, PipeTransform } from '@angular/core';
import {
  formatInrDisplay,
  formatInrWithSymbol,
  roundInrToPaise,
} from '../utils/money-display.util';

@Pipe({
  name: 'inrWhole',
  standalone: true,
})
export class InrWholePipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    withSymbol = false
  ): string | number {
    const n = typeof value === 'string' ? Number(value) : value;
    if (withSymbol === true) {
      return formatInrWithSymbol(n);
    }
    return formatInrDisplay(n);
  }
}

/** Expose 2dp number for bindings that need a numeric value. */
export function inrWholeNumber(value: number | null | undefined): number {
  return roundInrToPaise(value);
}
