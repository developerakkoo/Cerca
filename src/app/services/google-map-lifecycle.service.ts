import { Injectable } from '@angular/core';
import { GoogleMap } from '@capacitor/google-maps';

interface MapOwnerEntry {
  map: GoogleMap;
  suspended: boolean;
}

/**
 * Coordinates Capacitor Google Map instances across tab stacks and overlay routes.
 * Native maps render beneath the webview on Android; overlay pages must suspend
 * all maps so touches reach ion-content scrollers.
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleMapLifecycleService {
  private readonly owners = new Map<string, MapOwnerEntry>();

  register(ownerId: string, map: GoogleMap): void {
    this.owners.set(ownerId, { map, suspended: false });
  }

  unregister(ownerId: string): void {
    this.owners.delete(ownerId);
  }

  hasActiveMap(): boolean {
    return [...this.owners.values()].some((e) => !e.suspended && e.map != null);
  }

  getMap(ownerId: string): GoogleMap | null {
    const entry = this.owners.get(ownerId);
    if (!entry || entry.suspended) {
      return null;
    }
    return entry.map;
  }

  /**
   * Disable touch and destroy every registered map (e.g. before payment overlay).
   */
  async suspendAll(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const [ownerId, entry] of this.owners.entries()) {
      if (entry.suspended) {
        continue;
      }
      tasks.push(this.teardownEntry(ownerId, entry));
    }
    await Promise.all(tasks);
  }

  /**
   * Tear down a single owner's map (used by page-level cleanupMap).
   */
  async suspendOwner(ownerId: string): Promise<void> {
    const entry = this.owners.get(ownerId);
    if (!entry || entry.suspended) {
      return;
    }
    await this.teardownEntry(ownerId, entry);
  }

  private async teardownEntry(ownerId: string, entry: MapOwnerEntry): Promise<void> {
    const { map } = entry;
    try {
      await map.disableTouch();
    } catch (err) {
      console.warn(`[GoogleMapLifecycle] disableTouch failed for ${ownerId}:`, err);
    }
    try {
      await map.destroy();
    } catch (err) {
      console.warn(`[GoogleMapLifecycle] destroy failed for ${ownerId}:`, err);
    }
    entry.suspended = true;
    this.owners.delete(ownerId);
  }
}
