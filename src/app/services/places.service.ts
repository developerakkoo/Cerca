import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  types: string[];
}

export interface PlaceDetails {
  place_id: string;
  formatted_address: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

interface BackendAutocompleteResponse {
  success: boolean;
  data: {
    predictions: PlacePrediction[];
  };
  message?: string;
  error?: string;
}

interface BackendPlaceDetailsResponse {
  success: boolean;
  data: PlaceDetails | null;
  message?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlacesService {
  constructor(private http: HttpClient) {}

  getPlacePredictions(
    query: string,
    location?: { lat: number; lng: number },
    radius: number = 10000  // Reduced from 50000 to 10000 (10km)
  ): Observable<PlacePrediction[]> {
    if (!query || query.trim().length === 0) {
      return new Observable(observer => {
        observer.next([]);
        observer.complete();
      });
    }

    // Build backend API URL with query parameters
    let url = `${environment.apiUrl}/api/google-maps/places/autocomplete?query=${encodeURIComponent(query)}`;
    
    // Add location bias if provided - always use location when available for accurate results
    if (location && location.lat && location.lng) {
      url += `&lat=${location.lat}&lng=${location.lng}&radius=${radius}`;
    }

    return this.http.get<BackendAutocompleteResponse>(url).pipe(
      map((response) => {
        if (response.success && response.data && response.data.predictions) {
          return response.data.predictions;
        }
        return [];
      })
    );
  }

  getPlaceDetails(placeId: string): Observable<PlaceDetails | null> {
    const url = `${environment.apiUrl}/api/google-maps/places/details?place_id=${encodeURIComponent(placeId)}`;

    return this.http.get<BackendPlaceDetailsResponse>(url).pipe(
      map((response) => {
        if (response.success && response.data) {
          return response.data;
        }
        return null;
      })
    );
  }
}

