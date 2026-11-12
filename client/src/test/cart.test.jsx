import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from './utils';

vi.mock('../api/cart', () => ({
  getCart: vi.fn(),
  getCartCounts: vi.fn(),
  updateCartItem: vi.fn(),
}));
vi.mock('../api/agent', () => ({ runAgent: vi.fn(), getRun: vi.fn(), listRuns: vi.fn() }));

import * as cartApi from '../api/cart';
import Cart from '../pages/Cart';

const meta = { autoOrderEnabled: false, weeklySpendCapINR: 5000, weeklySpentINR: 1200, maxQtyMultiplier: 1.5 };
const social = [
  { _id: 's1', cartType: 'social', keyword: 'pickleball paddle', trendId: 't1', score: 78, trendStatus: 'emerging', suggestedQty: 3, minQty: 1, maxQty: 5, reason: 'Viral after a celebrity match', status: 'suggested', kind: 'suggestion', explain: { fits: true } },
  { _id: 's2', cartType: 'social', keyword: 'yoga wheel', trendId: 't2', score: 55, trendStatus: 'emerging', suggestedQty: 2, minQty: 1, maxQty: 4, reason: 'Fitness creators', status: 'suggested', kind: 'suggestion', explain: {} },
];
const price = [
  { _id: 'p1', cartType: 'price', label: 'Expected', product: { _id: 'x', name: 'Toor dal 1kg', perishable: false, unit: 'kg' }, suggestedQty: 10, minQty: 0, maxQty: 20, reason: 'Monsoon delay', status: 'suggested', kind: 'suggestion', explain: { verified: true, sourceCount: 4, regions: ['Maharashtra'] } },
  { _id: 'p2', cartType: 'price', label: 'Already happened', product: { _id: 'y', name: 'Onion', perishable: true, unit: 'kg' }, suggestedQty: 0, minQty: 0, maxQty: 0, reason: 'Mandi prices up 30%', status: 'suggested', kind: 'info', explain: { verified: true, sourceCount: 6 } },
];

beforeEach(() => {
  cartApi.getCartCounts.mockResolvedValue({ main: 0, social: 2, price: 2 });
  cartApi.getCart.mockImplementation(async (type) => ({ items: type === 'social' ? social : type === 'price' ? price : [], meta }));
});

describe('Cart page', () => {
  it('social tab has no approve-all button and shows the suggestions-only banner', async () => {
    renderWithProviders(<Cart />, { route: '/cart?tab=social' });
    expect(await screen.findByText('pickleball paddle')).toBeInTheDocument();
    expect(screen.getByText(/Suggestions only — nothing is ordered until you approve/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve all/i })).toBeNull();
    expect(screen.queryByText(/approve all/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: /approve trial/i })).toHaveLength(2);
  });

  it('price tab renders exactly the "Expected" and "Already happened" headings', async () => {
    renderWithProviders(<Cart />, { route: '/cart?tab=price' });
    const exp = await screen.findByRole('heading', { name: 'Expected' });
    const done = screen.getByRole('heading', { name: 'Already happened' });
    expect(exp).toHaveTextContent(/^Expected$/);
    expect(done).toHaveTextContent(/^Already happened$/);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Expected', 'Already happened']);
    // perishable item is warning only: no approve button for it
    const onionCard = screen.getByText('Onion').closest('li');
    expect(within(onionCard).queryByRole('button', { name: /buy ahead/i })).toBeNull();
    expect(within(onionCard).getByText(/warning only/i)).toBeInTheDocument();
  });

  it('tabs expose counts and switch with ARIA roles', async () => {
    renderWithProviders(<Cart />, { route: '/cart' });
    const tab = await screen.findByRole('tab', { name: /social media finds/i });
    fireEvent.click(tab);
    expect(await screen.findByText('yoga wheel')).toBeInTheDocument();
  });
});
