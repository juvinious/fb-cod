# Daggerheart: COD

A Foundry VTT supplementary module for the **[Daggerheart](https://foundryborne.online/)** system that introduces the **Colossal** adversary type and other content based around Colossus of the Drylands. This module allows you to import and manage giant, multi-segmented colossi the same way they are presented in the official source materials.

## Features

- **Colossus Actor Type:** Adds a new `Colossus` adversary actor type designed specifically for multi-segment colossi in Daggerheart.
    - **Dynamic Segments:** Manage complex colossi with multi-segmented body parts (Head, Limbs, Core, etc.), each with its own health, Difficulty/Armor, and unique abilities.
    - **Integrated Header Controls:** Quickly manage **HP**, **Attack Modifiers**, and status conditions like **Broken**, **Collapsed**, or **Destroyed** directly from the segment header.
    - **Chain Defeat Logic:** Organize segments into **Chain Groups (A-L)**. Configure defeat conditions where destroying an entire chain or a "Fatal" segment brings down the Colossus.
- **Built-in Importer:** Features a robust text parser that can instantly convert raw stat-blocks from the Colossus of the Drylands core rulebook into fully configured Colossi. Supports complex segment naming, Fatal tags, and Chain Groups.

## Compendiums

The module includes several ready-to-use compendiums:
- **Colossal Adversaries:** Pre-configured multi-segment colossi.
- **Colossal Segments:** A collection of segment footprints for manual builds.
- **Colossal Weapons & Loot:** Specialized equipment for Colossal-scale encounters.

## Installation

You can install this module directly in Foundry VTT by pasting the manifest link into the Add-On Modules menu:

**Manifest URL:**
`https://raw.githubusercontent.com/juvinious/fb-cod/main/module.json`


## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
