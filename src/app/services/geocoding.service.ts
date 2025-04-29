import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, map } from 'rxjs';

interface GeocodingResponse {
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor(private http: HttpClient) {}

  async getAddressFromLatLng(lat: number, lng: number): Promise<string> {
    try {
      const response = await this.http
        .get<GeocodingResponse>(`${this.GEOCODING_API_URL}?latlng=${lat},${lng}&key=${environment.apiKey}`)
        .toPromise();

      if (response && response.results && response.results.length > 0) {
        return response.results[0].formatted_address;
      }
      return 'Unknown location';
    } catch (error) {
      console.error('Error in geocoding:', error);
      return 'Unknown location';
    }
  }

  async getLatLngFromAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await this.http
        .get<GeocodingResponse>(`${this.GEOCODING_API_URL}?address=${encodeURIComponent(address)}&key=${environment.apiKey}`)
        .toPromise();

      if (response && response.results && response.results.length > 0) {
        const location = response.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng
        };
      }
      return null;
    } catch (error) {
      console.error('Error in reverse geocoding:', error);
      return null;
    }
  }
} 