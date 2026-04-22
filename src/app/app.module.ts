import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClient, HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './module/shared/shared.module';
import { GeocodingService } from './services/geocoding.service';
import { IonicStorageModule, Storage } from '@ionic/storage-angular';
import { TranslateLoader, TranslateService } from '@ngx-translate/core';
import { TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { SocketIoModule, SocketIoConfig } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { i18nAppInitializerFactory } from './i18n-app-initializer.factory';

const config: SocketIoConfig = {
  url: environment.apiUrl,
  options: {
    // Try websocket first, then fallback to polling (matches driver app)
    transports: ['websocket', 'polling'],
    autoConnect: false,
    // Reconnect policy is managed by SocketService state machine
    reconnection: false,
    // Add timeout configuration (30 seconds for HTTPS)
    timeout: 30000,
    // Force new connection
    forceNew: false,
    // Enable upgrade for better HTTPS compatibility
    upgrade: true,
    // Add path if your backend uses custom path
    path: '/socket.io/',
    // Better HTTPS compatibility
    withCredentials: false,
  },
};

export function createTranslateLoader(http: HttpClient) {
  return new TranslateHttpLoader(http, 'assets/i18n/', '.json');
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    SocketIoModule.forRoot(config),
    IonicStorageModule.forRoot({
      name: 'Cerca',
    }),
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient],
      },
    }),
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: i18nAppInitializerFactory,
      deps: [TranslateService, Storage],
      multi: true,
    },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    GeocodingService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
