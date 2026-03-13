import { setupColossusModel } from './data/colossus.mjs';
import { setupColossalSegmentModel } from './data/colossal-segment.mjs';
import { setupColossusSheet } from './sheets/colossus-sheet.mjs';
import { setupColossalSegmentSheet } from './sheets/colossus-segment-sheet.mjs';
import { openColossusImportDialog } from './colossus-import-dialog.mjs';
import { ColossusGenerator } from './colossus-generator.mjs';



Hooks.once('init', () => {
    console.log("fb-cod | Initializing fb-cod module");

    // 1. First, register all Daggerheart-specific configs so models have them available for schema definitions
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

    // 2. Register Actor and Item Data Models
    const ColossusModel = setupColossusModel();
    if (ColossusModel) {
        CONFIG.Actor.dataModels["fb-cod.colossus"] = ColossusModel;
        CONFIG.Actor.dataModels["foundryborne-giants.colossus"] = ColossusModel;
    }

    const ColossalSegmentModel = setupColossalSegmentModel();
    if (ColossalSegmentModel) {
        CONFIG.Item.dataModels["fb-cod.colossal-segment"] = ColossalSegmentModel;
        CONFIG.Item.dataModels["foundryborne-giants.colossal-segment"] = ColossalSegmentModel;
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
        <div class="fb-cod-directory-controls" style="display:flex; gap:5px; margin-top:5px;">
            <button class="import-colossus-button" style="flex:1;">
                <i class="fas fa-file-import"></i> Import
            </button>
            <button class="generate-colossus-button" style="flex:1;">
                <i class="fas fa-magic"></i> Generator
            </button>
        </div>
    `;

    // v13+ Native Application support
    if (html instanceof HTMLElement) {
        const footer = html.querySelector(".directory-footer");
        if (footer && !footer.querySelector(".fb-cod-directory-controls")) {
            footer.insertAdjacentHTML("beforeend", importBtnHTML);
            footer.querySelector(".import-colossus-button").addEventListener("click", () => {
                openColossusImportDialog();
            });
            footer.querySelector(".generate-colossus-button").addEventListener("click", () => {
                ColossusGenerator.launch();
            });
        }
    }
    // v12 JQuery fallback
    else if (html.find) {
        const footer = html.find(".directory-footer");
        if (footer.length && !footer.find(".fb-cod-directory-controls").length) {
            const $btn = $(importBtnHTML);
            footer.append($btn);
            $btn.find(".import-colossus-button").on("click", () => openColossusImportDialog());
            $btn.find(".generate-colossus-button").on("click", () => ColossusGenerator.launch());
        }
    }
});

