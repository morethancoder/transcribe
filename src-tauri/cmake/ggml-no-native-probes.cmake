# Stop ggml probing the CPU by running code.
#
# whisper.cpp's ggml detects ARM features with `check_cxx_source_runs` — it
# compiles a small program *and executes it*, once each for dotprod, i8mm, sve
# and sme (ggml/src/ggml-cpu/CMakeLists.txt). The i8mm probe
#
#     int8x16_t _a, _b; volatile int32x4_t _s = vmmlaq_s32(_s, _a, _b);
#
# never terminates on some Apple Silicon machines: the build sits on a spinning
# probe process forever, with no error and no output, which looks exactly like a
# slow build until you go looking for it.
#
# `GGML_NATIVE=OFF` takes ggml's other branch, which picks architecture flags
# without executing anything. Beyond unwedging the desktop build, this is
# *required* for Android and iOS: cross-compiling means the build host cannot
# run the target's instructions at all, so a probe there is meaningless even
# when it does terminate.
#
# Passed to cmake-rs through CMAKE_TOOLCHAIN_FILE_<host-target> — see
# .cargo/config.toml, which deliberately scopes it to macOS hosts so the
# Android/iOS cross-builds keep cmake-rs's own toolchain setup.
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
