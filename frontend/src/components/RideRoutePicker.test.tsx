import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import RideRoutePicker from "./RideRoutePicker";
import { mapStyles } from "../lib/mapStyles";

const fake = vi.hoisted(() => ({ maps: [] as {
  options: { style: string; center: number[] };
  events: Record<string, (event?: unknown) => void>;
  loaded: boolean;
  remove: ReturnType<typeof vi.fn>;
}[], failStart: false }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(), NavigationControl: class {},
  Map: class {
    options; events: Record<string, (event?: unknown) => void> = {};
    loaded = false; remove = vi.fn(); canvas = document.createElement("canvas");
    constructor(options: { style: string; center: number[] }) {
      if (fake.failStart) throw new Error("WebGL unavailable");
      this.options = options; fake.maps.push(this);
    }
    addControl() {} getCanvas() { return this.canvas; }
    on(event: string, callback: (event?: unknown) => void) { this.events[event] = callback; }
    getCenter() { return { lat: this.options.center[1], lng: this.options.center[0] }; }
    isStyleLoaded() { return this.loaded; }
  },
  Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} },
}));

beforeEach(() => { fake.maps.length = 0; fake.failStart = false; vi.stubEnv("VITE_MAPTILER_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());
function loaded(index = 0) {
  act(() => { fake.maps[index].loaded = true; fake.maps[index].events.load(); });
}

describe("ride map selection", () => {
  it("uses MapTiler only with a configured public key and otherwise OpenFreeMap", () => {
    expect(mapStyles("")).toEqual([{ name: "OpenFreeMap", style: "https://tiles.openfreemap.org/styles/liberty" }]);
    expect(mapStyles("synthetic key")[0]).toEqual({ name: "MapTiler",
      style: "https://api.maptiler.com/maps/streets-v4/style.json?key=synthetic%20key" });
  });
  it("does not assume campus, allows center selection, and switches to destination after pickup", async () => {
    const user = userEvent.setup(), selected = vi.fn();
    const view = render(<RideRoutePicker origin={null} destination={null} onSelect={selected} />);
    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose map center for From" })).toBeDisabled();
    loaded();
    await user.click(screen.getByRole("button", { name: "Choose map center for From" }));
    expect(selected).toHaveBeenLastCalledWith("origin_point", { lat: 38.7625, lng: -93.7395 });
    act(() => fake.maps[0].events.click({ lngLat: { lat: 38.79, lng: -93.74 } }));
    expect(selected).toHaveBeenLastCalledWith("destination_point", { lat: 38.79, lng: -93.74 });
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
    expect(selected).toHaveBeenCalledWith('origin_point', { lat: 0, lng: -179.75 });
  });
  it("falls back on MapTiler quota/auth/load failure and retains selected pins", () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "synthetic");
    render(<RideRoutePicker origin={{ lat: 38.78, lng: -93.73 }} destination={null} onSelect={vi.fn()} />);
    expect(fake.maps[0].options.style).toContain("api.maptiler.com");
    act(() => fake.maps[0].events.error({ error: { status: 429 } }));
    expect(fake.maps[0].remove).toHaveBeenCalledOnce();
    expect(fake.maps[1].options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(screen.getByText("MapTiler could not load. Using OpenFreeMap.")).toBeInTheDocument();
    expect(screen.getByText("From: 38.78000, -93.73000")).toBeInTheDocument();
  });
  it("shows an actionable error if WebGL cannot start", () => {
    fake.failStart = true;
    render(<RideRoutePicker origin={null} destination={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enable WebGL");
    expect(screen.getByRole("button", { name: "Retry map" })).toBeEnabled();
  });
});
