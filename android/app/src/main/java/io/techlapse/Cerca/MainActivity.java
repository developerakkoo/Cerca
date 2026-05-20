package io.techlapse.Cerca;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Channel id used by the backend (see firebase.notify.js
     * `android.notification.channelId`). On Android 8+ the channel must
     * exist client-side or notifications targeting it are silently dropped.
     */
    private static final String CERCA_CHANNEL_ID = "cerca_notifications";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createCercaNotificationChannel();
    }

    private void createCercaNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CERCA_CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CERCA_CHANNEL_ID,
            "Ride updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Ride status, chat messages and other Cerca alerts");
        channel.enableLights(true);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
