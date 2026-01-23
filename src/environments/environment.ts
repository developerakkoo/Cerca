// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiKey: 'AIzaSyDQq0QpnwQKzDR99ObP1frWj_uRTQ54pbo',
  mapId: '9b3666d396ff32ac93b8dc29',
  // Production backend
  apiUrl: 'https://api.myserverdevops.com',
  // Local backend (for development)  
  // apiUrl: 'http://192.168.1.14:3000',
  // Razorpay configuration
  razorpay: {
    key: 'rzp_live_S6q5OGF0WYChTn',
    // Secret: EZv5VecWiWi0FLyffYLDTM3H (for backend use only - do not expose in client-side code)
    name: 'Cerca',
    description: 'Taxi Booking Service',
    theme: { color: '#FF4C5A' }
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
