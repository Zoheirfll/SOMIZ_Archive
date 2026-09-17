import { formatDateFR } from '../utils/formatDate';

describe('formatDateFR', () => {
  test('formate une date ISO en DD/MM/YYYY', () => {
    expect(formatDateFR('2026-09-17')).toBe('17/09/2026');
  });

  test('formate une date ISO avec heure', () => {
    expect(formatDateFR('2026-01-05T14:30:00Z')).toBe('05/01/2026');
  });

  test('retourne un tiret pour null', () => {
    expect(formatDateFR(null)).toBe('—');
  });

  test('retourne un tiret pour undefined', () => {
    expect(formatDateFR(undefined)).toBe('—');
  });

  test('retourne un tiret pour une chaîne vide', () => {
    expect(formatDateFR('')).toBe('—');
  });
});
