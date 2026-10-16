# ADR-003: Detect YouTube Music through the installed macOS PWA

**Status:** Accepted  
**Date:** 2026-09-12  
**Author:** Martin

YouTube Music is supported only when it runs as an installed macOS PWA. The app identifies the distinct `YouTube Music` application through Launch Services and reads its playback state and track metadata from macOS Now Playing through MediaRemote. It does not inspect browser tabs. This keeps polling independent of the number of open tabs and prevents unrelated browser media from being mistaken for YouTube Music.

## Considered options

- **Enumerate browser tabs:** Rejected because polling time grows with the number of tabs and a YouTube Music tab does not prove that its media is currently playing.
- **Build a browser extension:** Rejected because it adds another component for users to install and maintain.
- **Use the installed PWA and system media state:** Accepted because macOS exposes the PWA as a distinct media application without additional dependencies.

## Consequences

- Ordinary YouTube Music browser tabs are not supported.
- The first implementation is macOS-only.
- MediaRemote is a private macOS framework and may require maintenance after operating-system updates. Failures remain isolated to the YouTube Music source.
- Missing Now Playing data during a track change is treated briefly as an indeterminate transition, while an explicit pause or a closed PWA makes the source inactive.
