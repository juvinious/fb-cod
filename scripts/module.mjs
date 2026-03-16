import { setupColossusModel } from './data/colossus.mjs';
import { setupColossalSegmentModel } from './data/colossal-segment.mjs';
import { setupColossalChainGroupModel } from './data/colossal-chain-group.mjs';
import { setupColossusSheet } from './sheets/colossus-sheet.mjs';
import { setupColossalSegmentSheet } from './sheets/colossus-segment-sheet.mjs';
import { setupColossalChainGroupSheet } from './sheets/colossal-chain-group-sheet.mjs';
import { openColossusImportDialog } from './colossus-import-dialog.mjs';
import { ColossusGenerator } from './colossus-generator.mjs';



Hooks.once('init', async () => {
    console.log("fb-cod | Initializing fb-cod module");

    // Initialize global config
    CONFIG.FB_COD = {
        segmentTypes: {},
        chainGroups: {}
    };

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
        CONFIG.DH.ITEM.featureTypes["fb-cod.colossal-chain-group"] = {
            id: "fb-cod.colossal-chain-group",
            label: "Colossal Chain Group"
        };
        console.log("fb-cod | Registered custom feature types in CONFIG.DH");
    }

    // 2. Register Actor and Item Data Models
    const ColossusModel = setupColossusModel();
    if (ColossusModel) {
        CONFIG.Actor.dataModels["fb-cod.colossus"] = ColossusModel;
    }

    const ColossalSegmentModel = setupColossalSegmentModel();
    if (ColossalSegmentModel) {
        CONFIG.Item.dataModels["fb-cod.colossal-segment"] = ColossalSegmentModel;
    }

    const ColossalChainGroupModel = setupColossalChainGroupModel();
    if (ColossalChainGroupModel) {
        CONFIG.Item.dataModels["fb-cod.colossal-chain-group"] = ColossalChainGroupModel;
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
        types: ["fb-cod.colossus"],
        makeDefault: true,
        label: "Colossus Sheet"
    });

    const ColossalSegmentSheet = setupColossalSegmentSheet();
    if (ColossalSegmentSheet) {
        DocumentSheetConfig.registerSheet(Item, "daggerheart", ColossalSegmentSheet, {
            types: ["fb-cod.colossal-segment"],
            makeDefault: true,
            label: "Colossal Segment Sheet"
        });
    }

    const ColossalChainGroupSheet = setupColossalChainGroupSheet();
    if (ColossalChainGroupSheet) {
        DocumentSheetConfig.registerSheet(Item, "daggerheart", ColossalChainGroupSheet, {
            types: ["fb-cod.colossal-chain-group"],
            makeDefault: true,
            label: "Colossal Chain Group Sheet"
        });
    }
});

Hooks.once('setup', async () => {
    console.log("fb-cod | Setup hook: performing early indexing of segments and chain groups.");
    await _indexPackData();
});

/**
 * Helper to index segment types and chain groups from compendiums.
 * This is called during 'setup' for early validation and 'ready' for full consistency.
 */
async function _indexPackData() {
    // --- Index Segments ---
    const pack = game.packs.get("fb-cod.colossal-segments");
    if (pack) {
        const index = await pack.getIndex({ fields: ["segmentType", "system.segmentType"] });
        const mapping = {};
        for (const entry of index) {
            const type = entry.segmentType || entry.system?.segmentType;
            if (type) mapping[type] = entry.name;
        }
        CONFIG.FB_COD.segmentTypes = mapping;
    }

    // --- Index Chain Groups ---
    const cgPack = game.packs.get("fb-cod.colossal-chain-groups");
    if (cgPack) {
        const cgIndex = await cgPack.getIndex({ fields: ["chainGroup", "system.chainGroup", "system.segmentTypes", "system.categories", "system.fatal"] });
        const cgMapping = { "": "Not Chained" };
        const cgMetadata = {};
        for (const entry of cgIndex) {
            const group = entry.chainGroup || entry.system?.chainGroup;
            if (group) {
                cgMapping[group] = entry.name;
                cgMetadata[group] = {
                    name: entry.name,
                    segmentTypes: entry.system?.segmentTypes || [],
                    categories: entry.system?.categories || [],
                    fatal: entry.system?.fatal ?? true
                };
            }
        }
        CONFIG.FB_COD.chainGroups = cgMapping;
        CONFIG.FB_COD.chainGroupsMetadata = cgMetadata;
    }
}

/**
 * Rename Synchronization Hook
 * If a Colossal Segment is renamed, update all associated features' identifiers.
 */
Hooks.on("preUpdateItem", (item, update) => {
    if (item.type !== "fb-cod.colossal-segment" || !update.name) return true;
    
    const oldName = item.name;
    const newName = update.name;
    const actor = item.parent;
    
    if (actor && oldName !== newName) {
        const featuresToUpdate = actor.items.filter(i => 
            i.type === "feature" && 
            i.system.identifier === oldName &&
            i.system.originItemType === "fb-cod.colossal-segment"
        );

        if (featuresToUpdate.length > 0) {
            console.log(`fb-cod | Renaming segment "${oldName}" to "${newName}". Synchronizing ${featuresToUpdate.length} features.`);
            const updates = featuresToUpdate.map(i => ({ _id: i.id, "system.identifier": newName }));
            actor.updateEmbeddedDocuments("Item", updates);
        }
    }
    return true;
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

Hooks.once('ready', async () => {
    console.log("fb-cod | Ready hook: refreshing pack indices.");
    await _indexPackData();
});

