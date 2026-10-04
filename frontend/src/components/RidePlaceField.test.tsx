import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoPoint } from '../api/types';
import { RidePlaceField } from './RidePlaceField';

const fake = vi.hoisted(() => ({ suggest: vi.fn(), reverse: vi.fn(), configured: true }));
vi.mock('../lib/places', () => ({ hasPlaceSearch: () => fake.configured, suggestPlaces: fake.suggest, reversePlace: fake.reverse }));
const campus = { id: 'ucm', label: 'University of Central Missouri, South Holden Street', point: { lat: 38.7625, lng: -93.7395 } };
const store = { id: 'walmart', label: 'Walmart Supercenter, East Cooper Street', point: { lat: 38.7905, lng: -93.739 } };
const selected = vi.fn(), edited = vi.fn(), submitted = vi.fn(), named = vi.fn();

function Harness({ initial = '', point: initialPoint = null, disabled = false }: {
  initial?: string; point?: GeoPoint | null; disabled?: boolean;
}) {
  const [value, setValue] = useState(initial), [point, setPoint] = useState(initialPoint);
  return <form onSubmit={(event) => { event.preventDefault(); submitted(); }}>
    <RidePlaceField field="origin_point" value={value} point={point} near={campus.point} autoHint={null} disabled={disabled}
      onEdit={(text) => { edited(text); setValue(text); setPoint(null); }}
      onSelect={(place) => { selected(place); setValue(place.label); setPoint(place.point); }}
      onAutoResolved={vi.fn()} onNameResolved={(p, name) => { named(p, name); setValue(name); }} />
    <button type="submit">Confirm</button>
  </form>;
}
const write = (value: string) => fireEvent.change(screen.getByRole('combobox', { name: 'From' }), { target: { value } });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(400); });
beforeEach(() => {
  vi.useFakeTimers(); fake.configured = true;
  fake.suggest.mockReset().mockResolvedValue([campus, store]); fake.reverse.mockReset().mockResolvedValue(store.label);
  selected.mockReset(); edited.mockReset(); submitted.mockReset(); named.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('From/To place suggestions', () => {
  it('waits for at least three characters and a pause, then selects an address with its coordinates', async () => {
    render(<Harness />);
    write('Wa'); await tick(); expect(fake.suggest).not.toHaveBeenCalled();
    write('Wal'); await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    write('Walmart'); await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(fake.suggest).not.toHaveBeenCalled(); await tick();
    expect(fake.suggest).toHaveBeenCalledOnce();
    expect(fake.suggest).toHaveBeenCalledWith('Walmart', campus.point, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('option', { name: store.label }));
    expect(selected).toHaveBeenCalledWith(store);
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue(store.label);
    expect(screen.getByText('Location selected')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/38\.7905|-93\.739/);
  });
  it('supports arrow keys, Enter and Escape without submitting the form', async () => {
    render(<Harness />); write('Walmart'); await tick();
    const input = screen.getByRole('combobox', { name: 'From' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: store.label })).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: store.label }).id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(selected).toHaveBeenCalledWith(store); expect(submitted).not.toHaveBeenCalled();
    write('Campus'); await tick(); fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('invalidates a selected point as soon as its name is edited', async () => {
    render(<Harness initial={campus.label} point={campus.point} />);
    expect(screen.getByText('Location selected')).toBeInTheDocument();
    write('Different starting place');
    expect(edited).toHaveBeenCalledWith('Different starting place');
    expect(screen.queryByText('Location selected')).not.toBeInTheDocument();
  });
  it('cancels stale queries and ignores their results even when the provider ignores abort', async () => {
    let finish!: (value: unknown) => void;
    fake.suggest.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness />); write('Old campus'); await tick();
    const signal = fake.suggest.mock.calls[0][2];
    write('Walmart'); expect(signal.aborted).toBe(true); await tick();
    await act(async () => finish([{ ...campus, label: 'Stale result' }]));
    expect(screen.queryByRole('option', { name: 'Stale result' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: store.label })).toBeInTheDocument();
  });
  it('cancels on blur or disable and never fetches merely because a saved label exists', async () => {
    const view = render(<Harness initial={campus.label} point={campus.point} />); await tick();
    expect(fake.suggest).not.toHaveBeenCalled();
    write('Walmart'); await tick();
    fireEvent.blur(screen.getByRole('combobox', { name: 'From' }));
    expect(fake.suggest.mock.calls[0][2].aborted).toBe(true);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    write('Campus'); await tick();
    view.rerender(<Harness disabled />);
    expect(fake.suggest.mock.calls[1][2].aborted).toBe(true);
    expect(screen.getByRole('combobox', { name: 'From' })).toBeDisabled();
  });
  it('redacts provider failures and offers a retry without inventing a location', async () => {
    fake.suggest.mockRejectedValueOnce(new Error('secret provider URL'));
    render(<Harness />); write('Walmart'); await tick();
    expect(screen.getByText(/Location search is unavailable/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('secret provider URL');
    expect(selected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry From search' })); await tick();
    expect(screen.getByRole('option', { name: store.label })).toBeInTheDocument();
  });
  it('handles empty results and missing configuration while keeping typing available', async () => {
    fake.suggest.mockResolvedValue([]);
    const view = render(<Harness />); write('Unknown street'); await tick();
    expect(screen.getByText(/No places found/)).toBeInTheDocument();
    fake.configured = false; view.rerender(<Harness />); write('Another place'); await tick();
    expect(fake.suggest).toHaveBeenCalledOnce();
    expect(screen.getByText(/Location suggestions are unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'From' })).toBeEnabled();
  });
  it('resolves an unnamed legacy point without displaying numbers or saving the post', async () => {
    render(<Harness point={store.point} />);
    await act(async () => {});
    expect(named).toHaveBeenCalledWith(store.point, store.label);
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue(store.label);
    expect(submitted).not.toHaveBeenCalled();
  });
});
