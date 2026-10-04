import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RideLocationAutofill } from './RideLocationAutofill';

const fake = vi.hoisted(() => ({ resolve: vi.fn(), configured: true }));
vi.mock('../lib/places', () => ({ hasPlaceSearch: () => fake.configured, resolveRidePlace: fake.resolve }));
const place = { id: 'campus', label: 'UCM, South Holden Street', point: { lat: 38.7625, lng: -93.7395 } };
beforeEach(() => { fake.configured = true; fake.resolve.mockReset().mockResolvedValue({ place, candidates: [place] }); });

describe('ride sentence locations', () => {
  it('resolves both fields independently without requiring a map click', async () => {
    const resolved = vi.fn();
    render(<RideLocationAutofill originHint="UCM" destinationHint="Walmart" onResolved={resolved} />);
    await waitFor(() => expect(resolved).toHaveBeenCalledTimes(2));
    expect(resolved).toHaveBeenCalledWith('origin_point', 'UCM', place);
    expect(resolved).toHaveBeenCalledWith('destination_point', 'Walmart', place);
  });
  it('offers choices for an ambiguous name, saving only the selected result', async () => {
    fake.resolve.mockResolvedValue({ place: null, candidates: [place] });
    const resolved = vi.fn(), user = userEvent.setup();
    render(<RideLocationAutofill originHint="Library" destinationHint={null} onResolved={resolved} />);
    await screen.findByText(/Choose the From location/);
    expect(resolved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Use UCM, South Holden Street for From' }));
    expect(resolved).toHaveBeenCalledWith('origin_point', 'Library', place);
  });
  it('ignores old responses when a follow-up or manual change replaces the hint', async () => {
    let finish!: (result: unknown) => void;
    fake.resolve.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const resolved = vi.fn();
    const view = render(<RideLocationAutofill originHint="Old campus" destinationHint={null} onResolved={resolved} />);
    view.rerender(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={resolved} />);
    expect(fake.resolve.mock.calls[0][1].aborted).toBe(true);
    await act(async () => finish({ place: { ...place, label: 'Old campus' }, candidates: [] }));
    await waitFor(() => expect(resolved).toHaveBeenCalledOnce());
    expect(resolved).toHaveBeenCalledWith('origin_point', 'UCM', place);
  });
  it('cancels during refinement and retries after it finishes', async () => {
    fake.resolve.mockImplementationOnce(() => new Promise(() => {}));
    const resolved = vi.fn();
    const view = render(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={resolved} />);
    view.rerender(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={resolved} disabled />);
    expect(fake.resolve.mock.calls[0][1].aborted).toBe(true);
    view.rerender(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={resolved} />);
    await waitFor(() => expect(resolved).toHaveBeenCalledOnce());
  });
  it('keeps the form usable when offline or lookup fails, with an explicit retry', async () => {
    fake.configured = false;
    const view = render(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Select From and To');
    expect(fake.resolve).not.toHaveBeenCalled();
    fake.configured = true; fake.resolve.mockRejectedValueOnce(new Error('provider secret'));
    view.rerender(<RideLocationAutofill originHint="UCM" destinationHint={null} onResolved={vi.fn()} />);
    await screen.findByText(/Couldn't find From on the map/);
    expect(view.container.textContent).not.toContain('provider secret');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry From lookup' }));
    await waitFor(() => expect(fake.resolve).toHaveBeenCalledTimes(2));
  });
});
