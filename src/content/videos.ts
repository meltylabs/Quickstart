// Videos de antes y después. Los archivos viven en /public/videos y /public/images.

export type VideoItem = {
  src: string;
  poster: string;
  caption: string;
  portrait?: boolean;
};

export const beforeAfterVideos: VideoItem[] = [
  {
    src: "/videos/antes-despues-1.mp4",
    poster: "/images/antes-despues-1.jpg",
    caption: "Resultado de tratamiento facial",
  },
  {
    src: "/videos/antes-despues-2.mp4",
    poster: "/images/antes-despues-2.jpg",
    caption: "Antes y después",
  },
  {
    src: "/videos/antes-despues-3.mp4",
    poster: "/images/antes-despues-3.jpg",
    caption: "Antes y después",
  },
  {
    src: "/videos/antes-despues-4.mp4",
    poster: "/images/antes-despues-4.jpg",
    caption: "Resultado de tratamiento",
    portrait: true,
  },
];

// Video del tratamiento de exosomas + dermapen (formato vertical).
export const treatmentVideo: VideoItem = {
  src: "/videos/exosomas-dermapen.mp4",
  poster: "/images/exosomas-dermapen.jpg",
  caption: "Tratamiento de exosomas y dermapen",
  portrait: true,
};
