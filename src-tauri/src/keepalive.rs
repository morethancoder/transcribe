//! Keep Android from freezing the app while the engine is busy.
//!
//! Modern Android freezes cached (backgrounded) processes and cuts their
//! network — which killed model downloads the moment the screen turned off or
//! the user switched apps. The fix is the platform's own: a foreground service
//! of type `dataSync`, holding a partial wakelock, alive exactly as long as a
//! download or a run is. The service itself is `KeepAliveService.kt`, injected
//! into the generated Android project by `scripts/android-service.sh`.
//!
//! Everything here is best-effort: if the service can't start (say the script
//! wasn't run and the class is missing), the work still proceeds — it just
//! stops surviving the background again, and a warning lands in the logs.
//!
//! On every other platform this module is a no-op; desktops don't freeze
//! foreground work.

/// RAII guard: the service runs while at least one of these is alive.
pub struct KeepAwake {
    #[cfg(target_os = "android")]
    app: tauri::AppHandle,
}

impl KeepAwake {
    #[allow(unused_variables)]
    pub fn new(app: &tauri::AppHandle, title: &str) -> Self {
        #[cfg(target_os = "android")]
        android::begin(app, title);
        Self {
            #[cfg(target_os = "android")]
            app: app.clone(),
        }
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        #[cfg(target_os = "android")]
        android::end(&self.app);
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use tauri::Manager;

    /// How many downloads/runs are in flight; the service exists while > 0.
    static ACTIVE: AtomicUsize = AtomicUsize::new(0);

    const SERVICE_CLASS: &str = "com.morethancoder.transcribe.KeepAliveService";

    pub fn begin(app: &tauri::AppHandle, title: &str) {
        if ACTIVE.fetch_add(1, Ordering::SeqCst) > 0 {
            return;
        }
        drive(app, Some(title.to_string()));
    }

    pub fn end(app: &tauri::AppHandle) {
        if ACTIVE.fetch_sub(1, Ordering::SeqCst) != 1 {
            return;
        }
        drive(app, None);
    }

    /// `Some(title)` starts the service, `None` stops it.
    ///
    /// Runs on the webview's JNI thread via wry's `JniHandle` — that thread is
    /// already attached to the JVM and hands over the Activity, which is both
    /// the `Context` for the Intent and the class loader that can actually see
    /// our service class (`FindClass` from a native thread cannot).
    fn drive(app: &tauri::AppHandle, title: Option<String>) {
        let Some(window) = app.get_webview_window("main") else {
            crate::logs::warn("android", "keep-alive: no main window to reach the JVM through");
            return;
        };
        let result = window.with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _webview| {
                let outcome: Result<(), Box<dyn std::error::Error>> = (|| {
                    let loader = env
                        .call_method(activity, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
                        .l()?;
                    let name = env.new_string(SERVICE_CLASS)?;
                    let class = env
                        .call_method(
                            &loader,
                            "loadClass",
                            "(Ljava/lang/String;)Ljava/lang/Class;",
                            &[(&*name).into()],
                        )?
                        .l()?;
                    let intent = env.new_object(
                        "android/content/Intent",
                        "(Landroid/content/Context;Ljava/lang/Class;)V",
                        &[activity.into(), (&class).into()],
                    )?;

                    match &title {
                        Some(text) => {
                            let key = env.new_string("title")?;
                            let value = env.new_string(text)?;
                            env.call_method(
                                &intent,
                                "putExtra",
                                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                                &[(&*key).into(), (&*value).into()],
                            )?;
                            // Foreground services exist since API 26; the min
                            // SDK is below that, so ask the older way there.
                            let sdk = env
                                .get_static_field("android/os/Build$VERSION", "SDK_INT", "I")?
                                .i()?;
                            let start = if sdk >= 26 { "startForegroundService" } else { "startService" };
                            env.call_method(
                                activity,
                                start,
                                "(Landroid/content/Intent;)Landroid/content/ComponentName;",
                                &[(&intent).into()],
                            )?;
                        }
                        None => {
                            env.call_method(
                                activity,
                                "stopService",
                                "(Landroid/content/Intent;)Z",
                                &[(&intent).into()],
                            )?;
                        }
                    }
                    Ok(())
                })();

                if let Err(e) = outcome {
                    // A pending Java exception is fatal to the next JNI call
                    // on this thread — clear it before anything else runs.
                    let _ = env.exception_clear();
                    crate::logs::warn("android", format!("keep-alive service call failed: {e}"));
                }
            });
        });
        if let Err(e) = result {
            crate::logs::warn("android", format!("keep-alive: could not reach the webview: {e}"));
        }
    }
}
