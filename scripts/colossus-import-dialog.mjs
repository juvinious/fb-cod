/**
 * Colossus Import Dialog
 *
 * A simple dialog with a textarea for pasting raw colossus stat-block text.
 * Uses Foundry's built-in Dialog API so no template file is needed.
 */
import { parseColossus, importColossus } from './colossus-importer.mjs';

/**
 * Open the "Import Colossus" dialog.
 * Resolves when the dialog is closed.
 */
export function openColossusImportDialog() {
    // The dialog content — a styled textarea for paste
    const content = `
        <div style="display:flex; flex-direction:column; gap:8px;">
            <p style="margin:0; font-size:0.9em; opacity:0.8;">
                Paste the raw colossus stat block below (as copied from the sourcebook).
                The importer will create the Colossus actor and all of its Segments automatically.
            </p>
            <textarea
                name="rawColossus"
                placeholder="Paste colossus text here…"
                style="
                    width: 100%;
                    height: 320px;
                    font-family: monospace;
                    font-size: 11px;
                    line-height: 1.5;
                    resize: vertical;
                    background: rgba(0,0,0,0.3);
                    color: #e8e8e8;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 4px;
                    padding: 8px;
                    box-sizing: border-box;
                "
            ></textarea>
        </div>
    `;

    new foundry.applications.api.DialogV2({
        window: { 
            title: 'Import Colossus',
            icon: 'fas fa-file-import',
            width: 600,
            height: 'auto'
        },
        content,
        buttons: [
            {
                action: 'import',
                label: 'Import',
                icon: 'fas fa-file-import',
                default: true,
                callback: async (event, button, instance) => {
                    const raw = instance.element.querySelector('[name="rawColossus"]').value?.trim();
                    if (!raw) {
                        ui.notifications.warn('No text provided — paste a colossus stat block first.');
                        return;
                    }
                    try {
                        const parsed = parseColossus(raw);
                        await importColossus(parsed);
                    } catch (err) {
                        console.error('fb-cod | Colossus import failed:', err);
                        ui.notifications.error(
                            `Colossus import failed: ${err.message}. Check the console for details.`
                        );
                    }
                }
            },
            {
                action: 'cancel',
                label: 'Cancel',
                icon: 'fas fa-times'
            }
        ],
        render: (instance) => {
            // Auto-focus the textarea when the dialog opens
            instance.element.querySelector('[name="rawColossus"]').focus();
        }
    }).render(true);
}
