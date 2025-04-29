// src/google-maps.d.ts
/// <reference types="@types/google.maps" />

declare global {
  interface Window {
    google: typeof google;
  }
}

export {};  // This ensures TypeScript treats the file as a module
  