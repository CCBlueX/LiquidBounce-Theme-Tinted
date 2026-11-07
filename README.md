# Tinted

A glass theme for LiquidBounce. The world stays visible behind every screen, items show their real textures, and
the HUD keeps your enabled modules and their key binds in view.

Reduce motion, reduce sound, increase contrast, reduce transparency, sound captions and interface scale are in the
theme's settings.

## Install

Subscribe to Tinted in the Marketplace tab of the client (`.marketplace subscribe 877`), or unpack a release ZIP into
`LiquidBounce/themes/tinted` and run `.client theme set tinted`.

## Build

```sh
bun install
bun run dev       # then .client theme set http://localhost:5173/ in the client
bun run package   # release/tinted-<version>.zip
```

Pushing a new `version` in `public/metadata.json` to `main` publishes it to the Marketplace.

## License

GPL-3.0. Inter is under the SIL Open Font License (`public/fonts/Inter-LICENSE.txt`). Sound credits are in
`public/sounds/CREDITS.txt`.
