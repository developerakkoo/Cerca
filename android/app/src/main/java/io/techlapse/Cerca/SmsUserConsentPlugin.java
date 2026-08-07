package io.techlapse.Cerca;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;

/**
 * Capacitor plugin wrapping Android's SMS User Consent API.
 * No READ_SMS permission is required — the user taps a system consent dialog.
 */
@CapacitorPlugin(name = "SmsUserConsent")
public class SmsUserConsentPlugin extends Plugin {

    private BroadcastReceiver smsReceiver;
    private PluginCall pendingCall;
    private boolean isListening = false;

    @PluginMethod
    public void startListening(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }

        stopListeningInternal();
        pendingCall = call;
        isListening = true;

        SmsRetriever.getClient(activity).startSmsUserConsent(null);

        IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
        smsReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) {
                    return;
                }

                Status status = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    status = intent.getParcelableExtra(SmsRetriever.EXTRA_STATUS, Status.class);
                } else {
                    status = intent.getParcelableExtra(SmsRetriever.EXTRA_STATUS);
                }

                if (status == null) {
                    rejectPending("SMS status missing");
                    return;
                }

                switch (status.getStatusCode()) {
                    case CommonStatusCodes.SUCCESS:
                        Intent consentIntent = null;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            consentIntent = intent.getParcelableExtra(
                                SmsRetriever.EXTRA_CONSENT_INTENT,
                                Intent.class
                            );
                        } else {
                            consentIntent = intent.getParcelableExtra(
                                SmsRetriever.EXTRA_CONSENT_INTENT
                            );
                        }

                        if (consentIntent == null) {
                            rejectPending("Consent intent missing");
                            return;
                        }

                        PluginCall activeCall = pendingCall;
                        if (activeCall == null) {
                            return;
                        }

                        try {
                            startActivityForResult(
                                activeCall,
                                consentIntent,
                                "handleConsentResult"
                            );
                        } catch (Exception e) {
                            rejectPending("Failed to launch consent dialog: " + e.getMessage());
                        }
                        break;

                    case CommonStatusCodes.TIMEOUT:
                        rejectPending("TIMEOUT");
                        break;

                    default:
                        rejectPending("SMS retrieval failed with status " + status.getStatusCode());
                        break;
                }
            }
        };

        ContextCompat.registerReceiver(
            activity,
            smsReceiver,
            filter,
            SmsRetriever.SEND_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED
        );
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        stopListeningInternal();
        call.resolve();
    }

    @ActivityCallback
    private void handleConsentResult(PluginCall call, ActivityResult result) {
        unregisterReceiver();
        isListening = false;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            if (call != null) {
                call.reject("USER_DECLINED");
            }
            clearPending();
            return;
        }

        String message = result.getData().getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE);
        if (message == null || message.trim().isEmpty()) {
            if (call != null) {
                call.reject("Empty SMS message");
            }
            clearPending();
            return;
        }

        JSObject ret = new JSObject();
        ret.put("message", message);
        if (call != null) {
            call.resolve(ret);
        }
        clearPending();
    }

    private void rejectPending(String message) {
        unregisterReceiver();
        isListening = false;
        if (pendingCall != null) {
            pendingCall.reject(message);
        }
        clearPending();
    }

    private void stopListeningInternal() {
        unregisterReceiver();
        if (pendingCall != null && isListening) {
            pendingCall.reject("CANCELLED");
        }
        clearPending();
        isListening = false;
    }

    private void unregisterReceiver() {
        Activity activity = getActivity();
        if (activity != null && smsReceiver != null) {
            try {
                activity.unregisterReceiver(smsReceiver);
            } catch (IllegalArgumentException ignored) {
                // Already unregistered
            }
        }
        smsReceiver = null;
    }

    private void clearPending() {
        pendingCall = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopListeningInternal();
        super.handleOnDestroy();
    }
}
