// utils.js
import { Decimal } from 'decimal.js';

export function weiToEther(weiValue) {
  const weiDecimal = new Decimal(weiValue);
  const etherDecimal = weiDecimal.dividedBy(new Decimal(1e18));
  return etherDecimal.toNumber();
}

export function etherToWei(etherValue) {
  const etherDecimal = new Decimal(etherValue);
  const weiDecimal = etherDecimal.times(new Decimal(1e18));
  return weiDecimal.toNumber();
}
