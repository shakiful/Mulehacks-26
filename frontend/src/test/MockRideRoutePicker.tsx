import type { GeoPoint } from "../api/types";
export default function MockRideRoutePicker({ onSelect, disabled }: {
  onSelect: (field: "origin_point" | "destination_point", point: GeoPoint) => void;
  disabled?: boolean;
}) {
  return <div>
    <button type="button" disabled={disabled} onClick={() => onSelect("origin_point", { lat: 38.7625, lng: -93.7395 })}>Select From point</button>
    <button type="button" disabled={disabled} onClick={() => onSelect("destination_point", { lat: 38.7905, lng: -93.7390 })}>Select To point</button>
  </div>;
}
