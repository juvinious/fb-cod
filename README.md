# Foundryborne COD

A Foundry VTT supplementary module for the **[Daggerheart](https://foundryborne.online/)** system that introduces the **Colossal** adversary type. This module allows you to import and manage giant, multi-segmented colossi the same way they are presented in the official source materials.

## Features

- **Colossus Actor Type:** Adds a new `Colossus` adversary actor type to the Daggerheart system.
- **Dynamic Segments:** Manage colossus segments directly on the sheet. Give each segment (Head, Left Arm, Torso, etc.) its own stats, difficulty, hit points, and unique features.
- **Damage Thresholds & Stress:** Track major and severe damage thresholds globally.
- **Segment Status Tracking:** Track individual destroyed and broken segment conditions, with visual flair, instantly from the colossus sheet.
- **Built-in Importer:** Quickly import massive stat blocks like the Colossus of the Drylands with a built-in text parser! Simply copy the raw formatted text, click the "Import Colossus" button in your Actors Directory sidebar, and the module handles all the data mapping for you.

## Installation

You can install this module directly in Foundry VTT by pasting the manifest link into the Add-On Modules menu:

**Manifest URL:**
`https://github.com/juvinious/fb-cod/releases/latest/download/module.json`

### For Developers (Deploying a Release)
To publish a new version of the module so it can be installed via the manifest link:

1. Update the `version` field in your `module.json` file.
2. Zip the contents of this repository into a file named `module.zip`. From your project directory you can run:
   ```bash
   zip -r module.zip ./* -x ".*" -x "*/.*"
   ```
3. Go to the "Releases" section of your GitHub repository and click **Draft a new release**.
4. Create a new tag matching your version (e.g., `v1.0.0`) and set a release title.
5. In the "Attach binaries" section, upload **both** `module.json` and your newly created `module.zip`.
6. Click **Publish release**.

Foundry uses the `/releases/latest/` route in the Manifest URL to automatically fetch and parse your newest uploaded `module.json` and `module.zip`!

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
