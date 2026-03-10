import { setupColossusModel } from './data/colossus.mjs';
import { setupColossalSegmentModel } from './data/colossal-segment.mjs';
import { setupColossusSheet } from './sheets/colossus-sheet.mjs';
import { setupColossalSegmentSheet } from './sheets/colossus-segment-sheet.mjs';
import { openColossusImportDialog } from './colossus-import-dialog.mjs';

Hooks.once('init', () => {
    console.log("fb-cod | Initializing");

    // 1. Monkey-patch getDefaultArtwork for safety and diagnostics
    const DhpActor = CONFIG.Actor.documentClass;
    if (DhpActor && DhpActor.getDefaultArtwork) {
        const originalGetDefaultArtwork = DhpActor.getDefaultArtwork;
        DhpActor.getDefaultArtwork = function (actorData) {
            const { type } = actorData;
            const Model = CONFIG.Actor.dataModels[type];

            if (!Model) {
                console.warn(`fb-cod | DhpActor.getDefaultArtwork requested for missing type: "${type}".`);
                const img = 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg';
                return { img, texture: { src: img } };
            }

            return originalGetDefaultArtwork.call(this, actorData);
        };
    }

    const DhpItem = CONFIG.Item.documentClass;
    if (DhpItem && DhpItem.getDefaultArtwork) {
        const originalGetDefaultArtworkItem = DhpItem.getDefaultArtwork;
        DhpItem.getDefaultArtwork = function (itemData) {
            const { type } = itemData;
            const Model = CONFIG.Item.dataModels[type];

            if (!Model) {
                console.warn(`fb-cod | DhpItem.getDefaultArtwork requested for missing type: "${type}".`);
                // Use a default item icon fallback
                const img = 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg';
                return { img, texture: { src: img } };
            }

            return originalGetDefaultArtworkItem.call(this, itemData);
        };
        console.log("fb-cod | Monkey-patched DhpItem.getDefaultArtwork");
    }

    // 1b. Monkey-patch DhpActor.prototype._preCreate for default sizing
    if (DhpActor && DhpActor.prototype._preCreate) {
        const originalPreCreate = DhpActor.prototype._preCreate;
        DhpActor.prototype._preCreate = async function (data, options, user) {
            // If this is our colossus type, ensure size is gargantuan if not specified
            if (this.type === "fb-cod.colossus" && !data.system?.size) {
                const update = {
                    system: {
                        size: 'gargantuan'
                    }
                };
                this.updateSource(update);
            }
            return originalPreCreate.call(this, data, options, user);
        };
        console.log("fb-cod | Monkey-patched DhpActor.prototype._preCreate");
    }

    // 2. Ensure system API is available
    if (!game.system.api) {
        console.warn("fb-cod | Daggerheart system API not found yet, attempting with fallbacks.");
    }

    // 3. Initialize Data Model
    console.log("fb-cod | Starting registration...");
    const ColossusModel = setupColossusModel();
    if (ColossusModel) {
        // Register under both keys for safety, but primary is namespaced
        CONFIG.Actor.dataModels["fb-cod.colossus"] = ColossusModel;
        CONFIG.Actor.dataModels.colossus = ColossusModel;
        console.log("fb-cod | Registered Colossus Data Model as 'fb-cod.colossus'");
    }

    // Register Item Data Model
    const ColossalSegmentModel = setupColossalSegmentModel();
    if (ColossalSegmentModel) {
        CONFIG.Item.dataModels["fb-cod.colossal-segment"] = ColossalSegmentModel;
        CONFIG.Item.dataModels["colossal-segment"] = ColossalSegmentModel;
        console.log("fb-cod | Registered Colossal Segment Data Model as 'fb-cod.colossal-segment'");
    }

    // 4. Inject into Homebrew Adversary Types as a fallback
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

    // 5. Initialize Sheet
    const ColossusSheet = setupColossusSheet();

    // 6. Register the sheet using the V2 standard
    const { DocumentSheetConfig } = foundry.applications.apps;
    DocumentSheetConfig.registerSheet(Actor, "daggerheart", ColossusSheet, {
        types: ["fb-cod.colossus", "colossus"],
        makeDefault: true,
        label: "Colossus Sheet"
    });
    console.log("fb-cod | Registered Colossus Actor Sheet for 'fb-cod.colossus'");

    // 7. Register the custom Colossal Segment Sheet (extends native FeatureSheet)
    const ColossalSegmentSheet = setupColossalSegmentSheet();
    if (ColossalSegmentSheet) {
        DocumentSheetConfig.registerSheet(Item, "daggerheart", ColossalSegmentSheet, {
            types: ["fb-cod.colossal-segment", "colossal-segment"],
            makeDefault: true,
            label: "Colossal Segment Sheet"
        });
        console.log("fb-cod | Registered ColossalSegmentSheet for 'fb-cod.colossal-segment'");
    } else {
        // Fallback to native FeatureSheet if our custom sheet failed to build
        const fallbackApi = game.system.api;
        const FallbackSheet = fallbackApi?.applications?.sheets?.items?.Feature;
        if (FallbackSheet) {
            DocumentSheetConfig.registerSheet(Item, "daggerheart", FallbackSheet, {
                types: ["fb-cod.colossal-segment", "colossal-segment"],
                makeDefault: true,
                label: "Colossal Segment Sheet (Fallback)"
            });
        }
        console.warn("fb-cod | Using fallback FeatureSheet for segments.");
    }

    // 8. Diagnostic Check after everything is settled
    setTimeout(() => {
        const hasActorModel = !!CONFIG.Actor.dataModels["fb-cod.colossus"];
        const hasItemModel = !!CONFIG.Item.dataModels["fb-cod.colossal-segment"];
        console.log("fb-cod | Post-init DataModel check - Actor:", hasActorModel, "Item:", hasItemModel);

        if (!hasActorModel && ColossusModel) {
            console.error("fb-cod | Colossus Actor DataModel MISSING after init! Re-registering...");
            CONFIG.Actor.dataModels["fb-cod.colossus"] = ColossusModel;
        }
        if (!hasItemModel && ColossalSegmentModel) {
            console.error("fb-cod | Colossal Segment Item DataModel MISSING after init! Re-registering...");
            CONFIG.Item.dataModels["fb-cod.colossal-segment"] = ColossalSegmentModel;
        }
    }, 500);

    // ── Inject "Import Colossus" button into the Actor Directory Footer ───────
    if (game.version < 13) {
        // v12 method using JQuery
        Hooks.on("renderSidebarTab", function (app, html) {
            if (app.options.classes.includes("actors-sidebar") && game.user.isGM) {
                const importBtn = $(`
                    <button class="import-colossus-button" style="margin-top: 5px;">
                        <i class="fas fa-file-import"></i> Import Colossus
                    </button>
                `);

                html.find(".directory-footer").append(importBtn);

                html.on("click", ".import-colossus-button", () => {
                    openColossusImportDialog();
                });
            }
        });
    } else {
        // v13 method without JQuery
        Hooks.on("renderActorDirectory", function (app, html) {
            if (!game.user.isGM) return;

            const importBtnHTML = `
                <button class="import-colossus-button" style="margin-top: 5px;">
                    <i class="fas fa-file-import"></i> Import Colossus
                </button>
            `;

            const footer = html.querySelector("#actors .directory-footer");
            if (footer) {
                footer.insertAdjacentHTML("beforeend", importBtnHTML);
                footer.querySelector(".import-colossus-button").addEventListener("click", () => {
                    openColossusImportDialog();
                });
            }
        });
    }
});

