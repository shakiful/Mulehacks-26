import type { GeoPoint } from "../api/types";
export default function MockRideRoutePicker({ onSelect, onNameResolved, disabled }: {
  onSelect: (field: "origin_point" | "destination_point", point: GeoPoint, label: string | null) => void;
  disabled?: boolean;
  onNameResolved?: (field: 'origin_point' | 'destination_point', point: GeoPoint, label: string) => void;
}) {
  return <div>
    <button type="button" disabled={disabled} onClick={() => onSelect("origin_point", { lat: 38.7625, lng: -93.7395 }, 'Campus')}>Select From point</button>
    <button type="button" disabled={disabled} onClick={() => onSelect("destination_point", { lat: 38.7905, lng: -93.7390 }, 'Walmart')}>Select To point</button>
    <button type="button" disabled={disabled} onClick={() => onSelect('destination_point', { lat: 38.7905, lng: -93.7390 }, null)}>Select To awaiting name</button>
    <button type="button" disabled={disabled} onClick={() => onNameResolved?.('destination_point', { lat: 38.7905, lng: -93.7390 }, 'Walmart')}>Resolve To name</button>
  </div>;
}
