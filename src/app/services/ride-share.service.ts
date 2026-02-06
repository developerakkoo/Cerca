import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { Storage } from '@ionic/storage-angular';
import { environment } from 'src/environments/environment';

export interface ShareLinkResponse {
  success: boolean;
  data: {
    shareUrl: string;
    shareToken: string;
    expiresAt: string;
    isShared: boolean;
  };
}

@Injectable({
  providedIn: 'root',
})
export class RideShareService {
  private apiUrl = `${environment.apiUrl}/api/rides`;

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {}

  /**
   * Generate share link for a ride
   * @param rideId - Ride ID
   * @returns Promise with share URL
   */
  async generateShareLink(rideId: string): Promise<string> {
    try {
      const token = await this.storage.get('token');
      if (!token) {
        console.error('❌ No token found in storage');
        throw new Error('Authentication required');
      }

      console.log('📤 Generating share link for ride:', rideId);
      console.log('🔑 Token exists:', !!token);

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      const url = `${this.apiUrl}/${rideId}/share`;
      console.log('🌐 Request URL:', url);

      const response = await this.http
        .post<ShareLinkResponse>(url, {}, { headers })
        .toPromise();

      console.log('✅ Response received:', response);

      if (response?.success && response.data?.shareUrl) {
        return response.data.shareUrl;
      } else {
        console.error('❌ Invalid response format:', response);
        throw new Error('Failed to generate share link');
      }
    } catch (error: any) {
      console.error('❌ Error generating share link:', error);
      console.error('Error details:', {
        status: error?.status,
        statusText: error?.statusText,
        message: error?.message,
        error: error?.error
      });
      
      // Re-throw with more context
      if (error?.error?.message) {
        throw new Error(error.error.message);
      } else if (error?.message) {
        throw error;
      } else {
        throw new Error('Failed to generate share link. Please try again.');
      }
    }
  }

  /**
   * Get existing share link for a ride
   * @param rideId - Ride ID
   * @returns Promise with share URL or null if not shared
   */
  async getShareLink(rideId: string): Promise<string | null> {
    try {
      const token = await this.storage.get('token');
      if (!token) {
        return null;
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      // Try to generate/get share link
      const response = await this.http
        .post<ShareLinkResponse>(`${this.apiUrl}/${rideId}/share`, {}, { headers })
        .toPromise();

      if (response?.success && response.data?.shareUrl) {
        return response.data.shareUrl;
      }

      return null;
    } catch (error: any) {
      console.error('Error getting share link:', error);
      return null;
    }
  }

  /**
   * Revoke share link for a ride
   * @param rideId - Ride ID
   */
  async revokeShareLink(rideId: string): Promise<void> {
    try {
      const token = await this.storage.get('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      await this.http
        .delete(`${this.apiUrl}/${rideId}/share`, { headers })
        .toPromise();
    } catch (error: any) {
      console.error('Error revoking share link:', error);
      throw error;
    }
  }

  /**
   * Share link using Web Share API or copy to clipboard
   * @param shareUrl - Share URL to share
   * @param title - Title for share
   * @param text - Text for share
   */
  async shareLink(shareUrl: string, title: string = 'Share Ride', text: string = 'Track my ride in real-time'): Promise<boolean> {
    try {
      // Try Web Share API first (mobile)
      if (navigator.share) {
        await navigator.share({
          title,
          text,
          url: shareUrl
        });
        return true;
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        return false; // Return false to indicate clipboard was used
      }
    } catch (error: any) {
      // User cancelled share or error occurred
      if (error.name !== 'AbortError') {
        console.error('Error sharing link:', error);
        // Fallback to clipboard
        try {
          await navigator.clipboard.writeText(shareUrl);
          return false;
        } catch (clipboardError) {
          console.error('Error copying to clipboard:', clipboardError);
          throw clipboardError;
        }
      }
      return false;
    }
  }
}

