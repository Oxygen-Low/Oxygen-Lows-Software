# Music Context

I have globalized the music state by creating a `MusicContext`.
This allows the music to keep playing even when the user navigates between pages.
I've also fixed the audio players in the Storage page to correctly handle local file previews by creating blob URLs for them.
The `useMusic` hook has been refactored to use the `MusicContext`.
The `MusicPlayer` component no longer renders its own `<audio>` tag, as it's now managed by the `MusicProvider`.
