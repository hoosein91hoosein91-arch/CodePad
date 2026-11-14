# CodePad 2.11.0 validation

The shipped build uses mobile-src, not the legacy React UI.

Completed before source publication:
- TypeScript: npm run typecheck.
- Existing Nava/Jib/launcher compatibility and backups: npm run test:launcher.
- Actual mobile compiler, GLB/glTF/OBJ/STL validation, skin deformation, linear/step/cubic clips, quaternion interpolation, swept collisions, gravity, momentum, fixed timestep and pause: npm run test:source.
- Actual Pyodide worker: timed stdout, asyncio task ownership, imports/errors, continuous execution beyond 25 seconds and termination.
- Actual browser UI: automatic/manual snapshots, restoration with attachments, full-backup download, data and APK version counters, invalid-backup rejection, mobile/desktop package guide.
- Actual APK export UI and module Worker: build and download a signed project APK. Android SDK tools verified v1/v2 signatures, manifest package/version and 16 KiB native alignment. ZIP CRC passed; no private signing key was packaged.
- Actual Windows export UI and Worker: download a portable ZIP; CRC, packaged runtime and real x64 PE Start.exe verified. Windows execution is not claimed.
- Actual WebGL: compiled Nava page renders a skinned animated glTF model, updates GPU position buffers, simulates a falling collider, and pauses/resumes animation and physics. Mobile and desktop screenshots inspected.

Publication gates in .github/workflows/android.yml:
- Repeat source, compatibility, browser, Python and export tests.
- Generate Android and compile all native plugins, including ApkExport.
- Verify the Android package and version 2110 / 2.11.0.
- Fresh Android 35 emulator: native plugin registration, document-picker cancellation, actual APK build, chunked native file save, signature/alignment, exported APK installation and Python execution.
- Retain validation artifacts and an Android shell for private stable signing.
- Create a release draft only after all gates pass. Final APK is signed locally with the retained private identity and verified with official Android tools before publication.

The GitHub run is the authority for native/emulator gate results. No physical-phone test, Windows execution test, seamless migration from the differently signed 2.10 package, full rigid-body physics or universal pip compatibility is claimed.
