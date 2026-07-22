import { useMusicContext } from "@/contexts/MusicContext";
export { type PlaylistTrack } from "@/contexts/MusicContext";

export const useMusic = () => {
  return useMusicContext();
};
