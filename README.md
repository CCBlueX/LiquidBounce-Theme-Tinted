# Tinted

A compact glass theme for LiquidBounce. The world stays visible behind every screen, and the HUD keeps your enabled
modules and their key binds in view. Scoreboard, Armor, Effects and Target are optional HUD pieces; move them with
Edit HUD in the ClickGUI.

Reduce motion, reduce sound, increase contrast, reduce transparency, sound captions and interface scale are under
Settings in the ClickGUI, next to the client's own settings.

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
## Credits

Inter is under the SIL Open Font License (`public/fonts/Inter-LICENSE.txt`). Sound credits are in
`public/sounds/CREDITS.txt`.

## Agent usage

Most of this code was written by AI models. Each declaration they wrote names its model in an `@agent` KDoc tag.
These are all models used so far and what they cost, summed up by [agent-usage](https://github.com/1zun4/agent-usage):

<a href="https://ccbluex.github.io/LiquidBounce-Theme-Tinted/ai-usage/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://ccbluex.github.io/LiquidBounce-Theme-Tinted/ai-usage-dark.svg">
    <img alt="AI models used in Tinted and their cost" src="https://ccbluex.github.io/LiquidBounce-Theme-Tinted/ai-usage-light.svg">
  </picture>
</a>

## Commits

`type(scope): subject`, lowercase, no trailing period.

`feat` `fix` `refactor` `chore` `docs`

## License

This project is subject to the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) (GPLv3). This only applies to source code located directly in this clean repository. During the development and compilation process, additional source code may be used to which we have obtained no rights. Such code is not covered by the GPL license.

For those who are unfamiliar with the license, here is a summary of its main points. This is by no means legal advice nor legally binding.

*Actions that you are allowed to do:*

* Use
* Share
* Modify

*If you do decide to use ANY code from the source:*

* **You must disclose the source code of your modified work and the source code you took from this project. This means you are not allowed to use code from this project (even partially) in a closed-source (or even obfuscated) application.**
* **Your modified application must also be licensed under the GPL.**
