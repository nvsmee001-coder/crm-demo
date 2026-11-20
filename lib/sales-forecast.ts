import { DEAL_PROBABILITIES, type Deal } from './crm-types.js';

export type ForecastPeriod = 'month' | 'quarter' | 'all';

export function salesForecast(deals: Deal[], period: ForecastPeriod, today: string) {
  const currentMonth = today.slice(0, 7);
  const quarter = (date: string) => Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  const entries = deals
    .filter(deal => {
      if (deal.stage === 'Đã chốt' || deal.stage === 'Không thành công') return false;
      if (period === 'month') return deal.closeDate?.slice(0, 7) === currentMonth;
      if (period === 'quarter') {
        return deal.closeDate?.slice(0, 4) === today.slice(0, 4) && quarter(deal.closeDate) === quarter(today);
      }
      return true;
    })
    .map(deal => {
      const probability = deal.probability ?? DEAL_PROBABILITIES[deal.stage] ?? 10;
      return {
        deal, probability, weighted: deal.value * probability / 100,
        overdue: Boolean(deal.closeDate && deal.closeDate < today),
      };
    })
    .sort((a, b) => b.weighted - a.weighted || a.deal.name.localeCompare(b.deal.name, 'vi'));

  return {
    entries,
    total: entries.reduce((sum, row) => sum + row.deal.value, 0),
    weighted: entries.reduce((sum, row) => sum + row.weighted, 0),
    overdue: entries.filter(row => row.overdue).length,
  };
}
