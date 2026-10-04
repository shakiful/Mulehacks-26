import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import RideRoutePicker from "./RideRoutePicker";
import { mapStyles } from "../lib/mapStyles";

const fake = vi.hoisted(() => ({ maps: [] as {
  options: { style: string; center: number[] };
  events: Record<string, (event?: unknown) => void>;
  loaded: boolean;
  remove: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
}[], failStart: false, reverse: vi.fn(), search: vi.fn() }));
vi.mock('../lib/places', () => ({
  hasPlaceSearch: () => Boolean(import.meta.env.VITE_MAPTILER_API_KEY),
  reversePlace: fake.reverse, searchPlaces: fake.search,
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(), NavigationControl: class {},
  Map: class {
    options; events: Record<string, (event?: unknown) => void> = {};
    loaded = false; remove = vi.fn(); flyTo = vi.fn(); canvas = document.createElement("canvas");
    constructor(options: { style: string; center: number[] }) {
      if (fake.failStart) throw new Error("WebGL unavailable");
      this.options = options; fake.maps.push(this);
    }
    addControl() {} getCanvas() { return this.canvas; }
    on(event: string, callback: (event?: unknown) => void) { this.events[event] = callback; }
    getCenter() { return { lat: this.options.center[1], lng: this.options.center[0] }; }
    isStyleLoaded() { return this.loaded; }
    getZoom() { return 15; }
  },
  Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} },
}));

beforeEach(() => { fake.maps.length = 0; fake.failStart = false; vi.stubEnv("VITE_MAPTILER_API_KEY", "synthetic");
  fake.reverse.mockReset().mockResolvedValue('College Avenue, Warrensburg');
  fake.search.mockReset().mockResolvedValue([{ id: 'poi.walmart', label: 'Walmart, Warrensburg', point: { lat: 38.79, lng: -93.73 } }]);
});
afterEach(() => vi.unstubAllEnvs());
function loaded(index = 0) {
  act(() => { fake.maps[index].loaded = true; fake.maps[index].events.load(); });
}

describe("ride map selection", () => {
  it("uses MapTiler only with a configured public key and otherwise OpenFreeMap", () => {
    expect(mapStyles("")).toEqual([{ name: "OpenFreeMap", style: "https://tiles.openfreemap.org/styles/bright" }]);
    expect(mapStyles("synthetic key")[0]).toEqual({ name: "MapTiler",
      style: "https://api.maptiler.com/maps/hybrid-v4/style.json?key=synthetic%20key" });
    expect(mapStyles('synthetic', 'street')[0].style).toContain('/base-v4/style.json');
  });
  it("does not assume campus, allows center selection, and switches to destination after pickup", async () => {
    const user = userEvent.setup(), selected = vi.fn();
    const view = render(<RideRoutePicker origin={null} destination={null} onSelect={selected} />);
    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose map center for From" })).toBeDisabled();
    loaded();
    await user.click(screen.getByRole("button", { name: "Choose map center for From" }));
    expect(selected).toHaveBeenLastCalledWith("origin_point", { lat: 38.7625, lng: -93.7395 }, null);
    act(() => fake.maps[0].events.click({ lngLat: { lat: 38.79, lng: -93.74 } }));
    expect(selected).toHaveBeenLastCalledWith("destination_point", { lat: 38.79, lng: -93.74 }, null);
    view.unmount();
    expect(fake.maps[0].remove).toHaveBeenCalledOnce();
  });
  it("ignores map clicks while posting or refining", () => {
    const selected = vi.fn();
    render(<RideRoutePicker origin={null} destination={null} disabled onSelect={selected} />);
    loaded();
    act(() => fake.maps[0].events.click({ lngLat: { lat: 38.79, lng: -93.74 } }));
    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose map center for From" })).toBeDisabled();
  });
  it("normalizes a selected point in a wrapped world copy", () => {
    const selected = vi.fn();
    render(<RideRoutePicker origin={null} destination={null} onSelect={selected} />);
    loaded();
    act(() => fake.maps[0].events.click({ lngLat: { lat: 0, lng: 540.25 } }));
    expect(selected).toHaveBeenCalledWith('origin_point', { lat: 0, lng: -179.75 }, null);
  });
  it("falls back on MapTiler quota/auth/load failure and retains selected pins", () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "synthetic");
    render(<RideRoutePicker origin={{ lat: 38.78, lng: -93.73 }} originLabel="College Avenue" destination={null} onSelect={vi.fn()} />);
    expect(fake.maps[0].options.style).toContain("api.maptiler.com");
    act(() => fake.maps[0].events.error({ error: { status: 429 } }));
    expect(fake.maps[0].remove).toHaveBeenCalledOnce();
    expect(fake.maps[1].options.style).toBe("https://tiles.openfreemap.org/styles/bright");
    expect(screen.getByText("MapTiler could not load. Using OpenFreeMap street map.")).toBeInTheDocument();
    expect(screen.getByText("From: College Avenue")).toBeInTheDocument();
  });
  it("shows an actionable error if WebGL cannot start", () => {
    fake.failStart = true;
    render(<RideRoutePicker origin={null} destination={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enable WebGL");
    expect(screen.getByRole("button", { name: "Retry map" })).toBeEnabled();
  });
  it('looks up street names for both pins and never displays their coordinates', async () => {
    const selected = vi.fn(), resolved = vi.fn(), user = userEvent.setup();
    const view = render(<RideRoutePicker origin={null} destination={null} onSelect={selected} onNameResolved={resolved} />);
    loaded();
    await user.click(screen.getByRole('button', { name: 'Choose map center for From' }));
    await waitFor(() => expect(resolved).toHaveBeenCalledWith('origin_point', { lat: 38.7625, lng: -93.7395 }, 'College Avenue, Warrensburg'));
    await act(async () => fake.maps[0].events.click({ lngLat: { lat: 38.79, lng: -93.73 } }));
    expect(resolved).toHaveBeenLastCalledWith('destination_point', { lat: 38.79, lng: -93.73 }, 'College Avenue, Warrensburg');
    expect(view.container.textContent).not.toMatch(/38\.\d+|-93\.\d+/);
  });
  it('searches a place, moves the map, and fills To after selecting From', async () => {
    const user = userEvent.setup(), selected = vi.fn(), submitted = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submitted}><RideRoutePicker origin={null} destination={null} onSelect={selected} /></form>);
    loaded();
    await user.type(screen.getByRole('textbox', { name: 'Search for pickup place' }), 'Walmart');
    expect(fake.search).not.toHaveBeenCalled(); // No paid requests on each keystroke.
    await user.click(screen.getByRole('button', { name: 'Search places' }));
    expect(selected).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Use Walmart, Warrensburg for From' }));
    expect(selected).toHaveBeenLastCalledWith('origin_point', { lat: 38.79, lng: -93.73 }, 'Walmart, Warrensburg');
    expect(fake.maps[0].flyTo).toHaveBeenCalledWith({ center: [-93.73, 38.79], zoom: 16 });
    const to = screen.getByRole('textbox', { name: 'Search for destination place' });
    await user.type(to, 'Walmart');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Use Walmart, Warrensburg for To' }));
    expect(selected).toHaveBeenLastCalledWith('destination_point', { lat: 38.79, lng: -93.73 }, 'Walmart, Warrensburg');
    expect(fake.reverse).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
  });
  it('ignores a late search result after changing its From/To target', async () => {
    let finish!: (places: unknown[]) => void;
    fake.search.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<RideRoutePicker origin={null} destination={null} onSelect={vi.fn()} />);
    loaded();
    await user.type(screen.getByRole('textbox', { name: 'Search for pickup place' }), 'Walmart');
    await user.click(screen.getByRole('button', { name: 'Search places' }));
    await user.click(screen.getByRole('button', { name: 'B · To' }));
    expect(fake.search.mock.calls[0][2].aborted).toBe(true);
    await act(async () => finish([{ id: 'old', label: 'Old search result', point: { lat: 1, lng: 2 } }]));
    expect(screen.queryByRole('list', { name: 'Place search results' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search for destination place' })).toHaveValue('');
  });
  it('ignores stale street names after reselecting the same pin', async () => {
    let finish!: (label: string) => void;
    fake.reverse.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const resolved = vi.fn(), user = userEvent.setup();
    render(<RideRoutePicker origin={null} destination={null} onSelect={vi.fn()} onNameResolved={resolved} />);
    loaded();
    await user.click(screen.getByRole('button', { name: 'Choose map center for From' }));
    await user.click(screen.getByRole('button', { name: 'A · From' }));
    await act(async () => fake.maps[0].events.click({ lngLat: { lat: 38.79, lng: -93.73 } }));
    expect(fake.reverse.mock.calls[0][1].aborted).toBe(true);
    await act(async () => finish('Old street name'));
    expect(resolved).toHaveBeenCalledOnce();
    expect(resolved).toHaveBeenCalledWith('origin_point', { lat: 38.79, lng: -93.73 }, 'College Avenue, Warrensburg');
  });
  it('offers retry or a manual name when lookup fails and preserves selected pins', async () => {
    fake.reverse.mockRejectedValueOnce(new Error('Place lookup unavailable'));
    const user = userEvent.setup(), selected = vi.fn(), resolved = vi.fn();
    const view = render(<RideRoutePicker origin={null} destination={null} onSelect={selected} onNameResolved={resolved} />);
    loaded();
    await user.click(screen.getByRole('button', { name: 'Choose map center for From' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Place lookup unavailable');
    view.rerender(<RideRoutePicker origin={{ lat: 38.7625, lng: -93.7395 }} destination={null} onSelect={selected} onNameResolved={resolved} />);
    await user.click(screen.getByRole('button', { name: 'Retry From name' }));
    await waitFor(() => expect(resolved).toHaveBeenCalledOnce());
    expect(selected).toHaveBeenCalledOnce();
  });
  it('switches between satellite and street views without changing selected names', async () => {
    const user = userEvent.setup();
    render(<RideRoutePicker origin={{ lat: 38.7625, lng: -93.7395 }} originLabel="College Avenue" destination={null} onSelect={vi.fn()} />);
    expect(fake.maps[0].options.style).toContain('/hybrid-v4/');
    await user.click(screen.getByRole('button', { name: 'Street map' }));
    expect(fake.maps[1].options.style).toContain('/base-v4/');
    expect(screen.getByText('From: College Avenue')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(fake.maps[2].options.style).toContain('/hybrid-v4/');
  });
  it('allows pin selection with manual names when no lookup key is configured', () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', '');
    render(<RideRoutePicker origin={null} destination={null} onSelect={vi.fn()} />);
    expect(fake.maps[0].options.style).toContain('openfreemap');
    expect(screen.getByRole('button', { name: 'Search places' })).toBeDisabled();
    expect(screen.getByText(/Place search is unavailable/)).toBeInTheDocument();
  });
  it('resolves unnamed existing pins without moving them or overwriting named locations', async () => {
    const origin = { lat: 38.7625, lng: -93.7395 }, destination = { lat: 38.79, lng: -93.73 };
    const selected = vi.fn(), resolved = vi.fn();
    render(<RideRoutePicker origin={origin} destination={destination} destinationLabel="Walmart entrance"
      onSelect={selected} onNameResolved={resolved} />);
    await waitFor(() => expect(resolved).toHaveBeenCalledWith('origin_point', origin, 'College Avenue, Warrensburg'));
    expect(fake.reverse).toHaveBeenCalledOnce();
    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByText('To: Walmart entrance')).toBeInTheDocument();
  });
});
