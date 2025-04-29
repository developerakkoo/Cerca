import { Component, ElementRef, ViewChild } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page {
  @ViewChild('map')
  mapRef!: ElementRef<HTMLElement>;
  newMap!: GoogleMap;

  constructor() {
  }

  ionViewDidEnter() {
    this.getCurrentPosition();

  }

  ionViewWillLeave() {
    console.log('ionViewWillLeave');
    
    this.newMap.destroy();
  }
  async createMap(lat: number, lng: number) {
    this.newMap = await GoogleMap.create({
      id: 'map',
      element: document.getElementById('map')!,
      apiKey: environment.apiKey,
      forceCreate: true,
      config: {
        mapId: environment.mapId,
        center: {
          lat: lat,
          lng: lng,
        },
        zoom: 18,
      },
    });

    await this.newMap.setMapType(MapType.Normal);
    await this.newMap.enableClustering();
    await this.newMap.enableCurrentLocation(true);  
    await this.newMap.addMarker({
      draggable:false,
      coordinate:{
        lat: lat,
        lng: lng,
      },
      title: 'Current Location',
      snippet: 'This is a snippet',
      iconUrl: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    });
  }


  async getCurrentPosition() {
    try {
      console.log('Getting current position...');
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      const { latitude, longitude } = coordinates.coords;
      console.log('Current position:', latitude, longitude);
      // You can add additional logic here to handle the coordinates
      this.createMap(latitude, longitude);
    } catch (error) {
      console.error('Error getting location:', error);
    }
  }
}
