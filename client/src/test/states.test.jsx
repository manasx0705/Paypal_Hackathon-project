import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './utils';

vi.mock('../api/orders', () => ({ listOrders: vi.fn() }));
import * as ordersApi from '../api/orders';
import Orders from '../pages/Orders';

describe('Orders page states', () => {
  it('shows an empty state with a next action', async () => {
    ordersApi.listOrders.mockResolvedValue([]);
    renderWithProviders(<Orders />);
    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to cart/i })).toHaveAttribute('href', '/cart');
  });

  it('shows an error state with retry that refetches', async () => {
    ordersApi.listOrders.mockRejectedValueOnce({ response: { data: { error: { code: 'BOOM', message: 'Database unavailable' } } } });
    renderWithProviders(<Orders />);
    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable')).toBeInTheDocument();
    ordersApi.listOrders.mockResolvedValueOnce([
      { _id: 'abc123def456', supplier: { name: 'Shree Traders' }, items: [], totalINR: 1500, status: 'draft', origin: 'agent', payment: { status: 'unpaid' }, createdAt: new Date().toISOString() },
    ]);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Shree Traders')).toBeInTheDocument();
  });
});
