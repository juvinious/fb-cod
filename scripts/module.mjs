import { setupColossusModel } from './data/colossus.mjs';
import { setupColossalSegmentModel } from './data/colossal-segment.mjs';
import { setupColossusSheet } from './sheets/colossus-sheet.mjs';
import { setupColossalSegmentSheet } from './sheets/colossus-segment-sheet.mjs';
import { openColossusImportDialog } from './colossus-import-dialog.mjs';



Hooks.once('init', () => {
    console.log("fb-cod | Initializing");

    // 1. Register Data Models
    const ColossusModel = setupColossusModel();
    if (ColossusModel) {
        CONFIG.Actor.dataModels["fb-cod.colossus"] = ColossusModel;
        // Backwards compatibility for world data using old namespaces
        CONFIG.Actor.dataModels["foundryborne-giants.colossus"] = ColossusModel;
        console.log("fb-cod | Registered Colossus Data Model");
    }

    const ColossalSegmentModel = setupColossalSegmentModel();
    if (ColossalSegmentModel) {
        CONFIG.Item.dataModels["fb-cod.colossal-segment"] = ColossalSegmentModel;
        // Backwards compatibility for world data using old namespaces
        CONFIG.Item.dataModels["foundryborne-giants.colossal-segment"] = ColossalSegmentModel;
        console.log("fb-cod | Registered Colossal Segment Data Model");
    }

    // 2. Register Custom Feature Types for originItemType validation
    if (CONFIG.DH?.ITEM) {
        CONFIG.DH.ITEM.featureTypes["fb-cod.colossus"] = {
            id: "fb-cod.colossus",
            label: "Colossus"
        };
        CONFIG.DH.ITEM.featureTypes["fb-cod.colossal-segment"] = {
            id: "fb-cod.colossal-segment",
            label: "Colossal Segment"
        };
        // Legacy support
        CONFIG.DH.ITEM.featureTypes["foundryborne-giants.colossus"] = {
            id: "foundryborne-giants.colossus",
            label: "Colossus (Legacy)"
        };
        CONFIG.DH.ITEM.featureTypes["foundryborne-giants.colossal-segment"] = {
            id: "foundryborne-giants.colossal-segment",
            label: "Colossal Segment (Legacy)"
        };
        console.log("fb-cod | Registered custom feature types in CONFIG.DH");
    }

    // 3. Inject into Homebrew Adversary Types
    if (game.settings.settings.has('daggerheart.gameSettings.Homebrew')) {
        try {
            const homebrew = game.settings.get('daggerheart', 'gameSettings.Homebrew');
            homebrew.adversaryTypes["fb-cod.colossus"] = {
                id: 'fb-cod.colossus',
                label: 'Colossus',
                description: 'A massive adversary composed of multiple segments.'
            };
        } catch (e) {
            console.error("fb-cod | Failed to inject homebrew type:", e);
        }
    }

    // 4. Register Sheets
    const { DocumentSheetConfig } = foundry.applications.apps;

    const ColossusSheet = setupColossusSheet();
    DocumentSheetConfig.registerSheet(Actor, "daggerheart", ColossusSheet, {
        types: ["fb-cod.colossus", "foundryborne-giants.colossus"],
        makeDefault: true,
        label: "Colossus Sheet"
    });

    const ColossalSegmentSheet = setupColossalSegmentSheet();
    if (ColossalSegmentSheet) {
        DocumentSheetConfig.registerSheet(Item, "daggerheart", ColossalSegmentSheet, {
            types: ["fb-cod.colossal-segment", "foundryborne-giants.colossal-segment"],
            makeDefault: true,
            label: "Colossal Segment Sheet"
        });
    }
});

// ── Inject "Import Colossus" button into the Actor Directory Footer ───────
Hooks.on("renderActorDirectory", function (app, html) {
    if (!game.user.isGM) return;

    const importBtnHTML = `
        <button class="import-colossus-button" style="margin-top: 5px;">
            <i class="fas fa-file-import"></i> Import Colossus
        </button>
    `;

    // v13+ Native Application support
    if (html instanceof HTMLElement) {
        const footer = html.querySelector(".directory-footer");
        if (footer && !footer.querySelector(".import-colossus-button")) {
            footer.insertAdjacentHTML("beforeend", importBtnHTML);
            footer.querySelector(".import-colossus-button").addEventListener("click", () => {
                openColossusImportDialog();
            });
        }
    }
    // v12 JQuery fallback
    else if (html.find) {
        const footer = html.find(".directory-footer");
        if (footer.length && !footer.find(".import-colossus-button").length) {
            const $btn = $(importBtnHTML);
            footer.append($btn);
            $btn.on("click", () => openColossusImportDialog());
        }
    }
});

