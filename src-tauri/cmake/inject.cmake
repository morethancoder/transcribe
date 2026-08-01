# Injected into whisper.cpp's CMake via CMAKE_PROJECT_INCLUDE (cmake-rs turns
# any CMAKE_* environment variable into a -D define — see .cargo/config.toml).
#
# Why: whisper-rs-sys 0.15.0's build script decides what to link with
# `cfg!(target_os = "macos")`, which answers for the *host*, not the target.
# Cross-compiling from a Mac to Android therefore links `ggml-blas` — a library
# the Android build never produces, since there's no BLAS there and GGML_BLAS
# is off. Feeding the linker an empty archive of that name satisfies the link
# without providing symbols, which is exactly right: nothing references any.
#
# Guarded to Android; on desktop the real ggml-blas exists and this is a no-op.
# Delete when whisper-rs fixes the check (it should consult env::var("TARGET")).
if(ANDROID AND NOT TARGET ggml-blas)
    file(WRITE "${CMAKE_BINARY_DIR}/ggml_blas_stub.c" "/* intentionally empty */\n")
    add_library(ggml-blas STATIC "${CMAKE_BINARY_DIR}/ggml_blas_stub.c")
    install(TARGETS ggml-blas DESTINATION lib)
endif()
