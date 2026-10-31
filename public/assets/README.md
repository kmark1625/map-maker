# Assets

Drop image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`,
`.avif`, `.bmp`, `.ico`) into this directory.

- Files served from here are public and cacheable. Do not put secrets here.
- Reference a file from the app as `/assets/<filename>`, e.g.
  `<img src=\"/assets/forest.png\" alt=\"Forest\" />`.
- Every image in this folder is shown automatically on the `/assets`
  gallery page. Non-image files (like this README) are ignored there.
