// A foreground service that exists to keep the process alive — the engine
// (downloads, whisper) runs in Rust inside the app process; without this,
// Android freezes that process shortly after the app leaves the foreground or
// the screen turns off, and every download stalls mid-file.
//
// This file lives in src-tauri/android/ and is copied into the generated
// project by scripts/android-service.sh, because `tauri android init`
// regenerates gen/android and would discard anything edited in place.
//
// Framework APIs only (no androidx): the generated project's dependencies
// shouldn't have to grow for one notification.
package com.morethancoder.transcribe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class KeepAliveService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "Working in the background"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                // IMPORTANCE_LOW: visible in the shade, but silent — this is a
                // status line, not an event.
                NotificationChannel(CHANNEL, "Background work", NotificationManager.IMPORTANCE_LOW)
            )
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION") Notification.Builder(this)
        }
        val notification: Notification = builder
            .setContentTitle(title)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(ID, notification)
        }

        // The service keeps the process unfrozen; the wakelock keeps the CPU
        // running with the screen off. Time-limited as a backstop — Rust stops
        // this service the moment the work ends, which releases it in
        // onDestroy long before the limit.
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "transcribe:engine")
                .apply {
                    setReferenceCounted(false)
                    acquire(6 * 60 * 60 * 1000L)
                }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "background-work"
        private const val ID = 917
    }
}
