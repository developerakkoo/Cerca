import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  constructor(private storage: Storage) {}

  async get(key: string) {
    return await this.storage.get(key);
  }

  async set(key: string, value: any) {
    return await this.storage.set(key, value);
  }

  async remove(key: string) {
    return await this.storage.remove(key);
  }

  async clear() {
    return await this.storage.clear();
  }
}
