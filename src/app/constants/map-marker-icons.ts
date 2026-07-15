import { Capacitor } from '@capacitor/core';

export type MapMarkerKind = 'pickup' | 'dropoff' | 'driver';

/** Pin markers sit on the coordinate; cab marker is centered on the vehicle. */
export const MAP_MARKER_SIZES: Record<
  MapMarkerKind,
  { width: number; height: number; anchor?: { x: number; y: number } }
> = {
  pickup: { width: 36, height: 42, anchor: { x: 0.5, y: 1 } },
  dropoff: { width: 36, height: 42, anchor: { x: 0.5, y: 1 } },
  driver: { width: 44, height: 44, anchor: { x: 0.5, y: 0.5 } },
};

/**
 * SVG on web (Capacitor Google Maps web uses <img>).
 * PNG on native — Android/iOS BitmapFactory/UIImage do not decode SVG.
 */
export function mapMarkerIconUrl(kind: MapMarkerKind): string {
  const ext = Capacitor.isNativePlatform() ? 'png' : 'svg';
  return `assets/map-markers/marker-${kind}.${ext}`;
}

export function mapMarkerImage(kind: MapMarkerKind): {
  iconUrl: string;
  iconSize: { width: number; height: number };
  iconAnchor?: { x: number; y: number };
} {
  const { width, height, anchor } = MAP_MARKER_SIZES[kind];
  return {
    iconUrl: mapMarkerIconUrl(kind),
    iconSize: { width, height },
    ...(anchor ? { iconAnchor: anchor } : {}),
  };
}
