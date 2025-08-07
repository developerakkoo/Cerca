import { Injectable, NgZone } from '@angular/core';
import { GoogleMap } from '@capacitor/google-maps';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface MapState {
  isReady: boolean;
  currentLocation: { lat: number; lng: number };
  zoom: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private tab1MapInstance: GoogleMap | null = null;
  private searchMapInstance: GoogleMap | null = null;
  private currentMapType: 'tab1' | 'search' | null = null;
  private mapStateSubject = new BehaviorSubject<MapState>({
    isReady: false,
    currentLocation: { lat: 0, lng: 0 },
    zoom: 15
  });

  public mapState$ = this.mapStateSubject.asObservable();

  constructor(private zone: NgZone) {}

  async createTab1Map(elementId: string, lat: number, lng: number): Promise<GoogleMap> {
    // Destroy existing tab1 map if it exists
    if (this.tab1MapInstance) {
      await this.destroyTab1Map();
    }

    try {
      const element = document.getElementById(elementId);
      if (!element) {
        throw new Error(`Element with id '${elementId}' not found`);
      }

      console.log('Creating tab1 map for element:', elementId);

      this.tab1MapInstance = await GoogleMap.create({
        id: 'tab1-map',
        element: element,
        apiKey: environment.apiKey,
        config: {
          androidLiteMode: true,
          center: { lat, lng },
          mapId: environment.mapId,
          zoom: 15,
        },
      });

      console.log('Tab1 map created successfully:', !!this.tab1MapInstance);
      this.currentMapType = 'tab1';

      this.zone.run(() => {
        this.mapStateSubject.next({
          isReady: true,
          currentLocation: { lat, lng },
          zoom: 15
        });
      });

      return this.tab1MapInstance;
    } catch (error) {
      console.error('Error creating tab1 map:', error);
      throw error;
    }
  }

  async createSearchMap(elementId: string, lat: number, lng: number): Promise<GoogleMap> {
    // Destroy existing search map if it exists
    if (this.searchMapInstance) {
      await this.destroySearchMap();
    }

    try {
      const element = document.getElementById(elementId);
      if (!element) {
        throw new Error(`Element with id '${elementId}' not found`);
      }

      console.log('Creating search map for element:', elementId);

      this.searchMapInstance = await GoogleMap.create({
        id: 'search-map',
        element: element,
        apiKey: environment.apiKey,
        config: {
          androidLiteMode: true,
          center: { lat, lng },
          mapId: environment.mapId,
          zoom: 15,
        },
      });

      console.log('Search map created successfully:', !!this.searchMapInstance);
      this.currentMapType = 'search';

      this.zone.run(() => {
        this.mapStateSubject.next({
          isReady: true,
          currentLocation: { lat, lng },
          zoom: 15
        });
      });

      return this.searchMapInstance;
    } catch (error) {
      console.error('Error creating search map:', error);
      throw error;
    }
  }

  getTab1Map(): GoogleMap | null {
    return this.tab1MapInstance;
  }

  getSearchMap(): GoogleMap | null {
    return this.searchMapInstance;
  }

  isTab1MapReady(): boolean {
    return this.tab1MapInstance !== null;
  }

  isSearchMapReady(): boolean {
    return this.searchMapInstance !== null;
  }

  async destroyTab1Map(): Promise<void> {
    if (this.tab1MapInstance) {
      try {
        await this.tab1MapInstance.destroy();
        this.tab1MapInstance = null;
        if (this.currentMapType === 'tab1') {
          this.currentMapType = null;
        }
        this.zone.run(() => {
          this.mapStateSubject.next({
            isReady: false,
            currentLocation: { lat: 0, lng: 0 },
            zoom: 15
          });
        });
      } catch (error) {
        console.error('Error destroying tab1 map:', error);
      }
    }
  }

  async destroySearchMap(): Promise<void> {
    if (this.searchMapInstance) {
      try {
        await this.searchMapInstance.destroy();
        this.searchMapInstance = null;
        if (this.currentMapType === 'search') {
          this.currentMapType = null;
        }
        this.zone.run(() => {
          this.mapStateSubject.next({
            isReady: false,
            currentLocation: { lat: 0, lng: 0 },
            zoom: 15
          });
        });
      } catch (error) {
        console.error('Error destroying search map:', error);
      }
    }
  }

  async setCamera(coordinate: { lat: number; lng: number }, zoom?: number): Promise<void> {
    const currentMap = this.currentMapType === 'tab1' ? this.tab1MapInstance : this.searchMapInstance;
    if (currentMap) {
      await currentMap.setCamera({
        coordinate,
        zoom: zoom || 15
      });
    }
  }

  async addMarker(options: any): Promise<string> {
    const currentMap = this.currentMapType === 'tab1' ? this.tab1MapInstance : this.searchMapInstance;
    if (currentMap) {
      return await currentMap.addMarker(options);
    }
    throw new Error('Map not initialized');
  }

  async removeMarker(markerId: string): Promise<void> {
    const currentMap = this.currentMapType === 'tab1' ? this.tab1MapInstance : this.searchMapInstance;
    if (currentMap) {
      await currentMap.removeMarker(markerId);
    }
  }

  getCurrentMapState(): MapState {
    return this.mapStateSubject.value;
  }

  getCurrentMapType(): 'tab1' | 'search' | null {
    return this.currentMapType;
  }

  setCurrentMapType(type: 'tab1' | 'search'): void {
    this.currentMapType = type;
    console.log('Current map type set to:', type);
  }

  getCurrentMap(): GoogleMap | null {
    if (this.currentMapType === 'tab1') {
      return this.tab1MapInstance;
    } else if (this.currentMapType === 'search') {
      return this.searchMapInstance;
    }
    return null;
  }
}
