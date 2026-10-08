# Vibe Windows fork

This fork contains the working speaker-recognition and folder-transcription fixes, plus the existing transcription queue and project-group enhancements.

## Fixed behavior

- Speaker recognition uses a compatible Nemotron engine instead of sending a Nemotron model to the older Sortformer engine.
- Settings > Tuning offers the recommended Nemotron Q8_0 model or a compatible local Nemotron GGUF.
- Requested diarization failures report their cause and stop the affected batch rather than silently omitting speaker labels.
- Cancelled or invalid model downloads do not enable speaker recognition.
- Select folder supports optional recursive transcription, literal Windows folder names, protected subfolders, and junction-cycle protection.
- Google Drive folder links explain how to download or sync the folder locally. Individual shared media links remain supported.

## Windows portable release

The fork release is `v3.2.2-fork.1`; the app itself reports version 3.2.2. Download the Windows x64 portable ZIP from this fork's Releases page, extract it, and keep all included files together. Start `vibe.exe`.

This is the verified portable build, not the older installer produced before these fixes. Model weights, user configuration, recordings, and transcripts are not included.

The current binary retains the upstream update endpoint. Use this fork's Releases page for fork updates; accepting an upstream update can replace this build.

## Validation

- 126 desktop tests passed.
- 4 production folder-scanner tests passed in a standalone native harness.
- 1 diarization-error regression and 8 speaker-attribution tests passed.
- The installed Nemotron Q8_0 model produced a speaker turn on repository sample audio.
- Production frontend, Windows app, and source engine builds completed.
- The packaged engine starts with a system-only PATH, without compiler-directory dependencies.

## Build notes

Use pnpm for JavaScript and the repository chore tasks where available. Build the engine from `server/`; downloading the older pinned sidecar alone does not include the Nemotron engine used by this fork.

The verified Windows build used Rust's GNU target. Keep the build output outside the repository's path containing spaces, for example `C:/vibe_build`, to avoid the Windows resource compiler's path-quoting failure.

The engine used the repository's pinned GGML v0.22.0 r6 GNU libraries and libclang for bindings. Its C++ runtime needed to match those libraries: Rust's GNU toolchain `lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained/libstdc++.a` supplied the matching ABI. The local compiler's UCRT C++ archive was incompatible. The tested local OpenMP runtime also needed `-ldl`, and the portable release includes its `libdl.dll` dependency.

After setting up those native prerequisites, the final build commands were:

```powershell
pnpm --dir desktop build
$env:CARGO_TARGET_DIR = 'C:/vibe_build/server'
cargo rustc --manifest-path server/Cargo.toml -p vibe-server --release --bin vibe-server -- -C link-arg=-ldl
$env:CARGO_TARGET_DIR = 'C:/vibe_build'
cargo build --release -p vibe --features tauri/custom-protocol
```

Package the new `vibe-server.exe` beside `vibe.exe`, along with the media decoder, WebView2 loader, and required runtime DLLs. Check dependencies and model inference before publishing. These notes record the working local build; they do not claim a fully automated clean-machine build.