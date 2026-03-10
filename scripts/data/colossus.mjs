/**
 * Setup the Colossus Data Model by extending Daggerheart's Adversary model.
 * @returns {typeof foundry.abstract.TypeDataModel}
 */
export function setupColossusModel() {
    console.log("fb-cod | setupColossusModel called");
    console.log("fb-cod | game.system.api available:", !!game.system.api);

    // Fallback to CONFIG if API isn't fully ready
    const AdversaryModel = game.system.api?.models?.actors?.DhAdversary || CONFIG.Actor.dataModels.adversary;

    console.log("fb-cod | AdversaryModel found:", !!AdversaryModel);

    if (!AdversaryModel) {
        console.error("fb-cod | Could not find Adversary base model! CONFIG.Actor.dataModels keys:", Object.keys(CONFIG.Actor.dataModels));
        return null;
    }

    return class ColossusDataModel extends AdversaryModel {
        /**@inheritdoc */
        static DEFAULT_ICON = 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg';

        /** @returns {ActorDataModelMetadata} */
        static get metadata() {
            const metadata = foundry.utils.mergeObject(super.metadata, {
                label: 'Colossus',
                type: 'fb-cod.colossus',
                isNPC: true,
                hasResistances: true,
                usesSize: true,
                hasAttribution: false,
                hasLimitedView: true
            });
            console.log("fb-cod | ColossusDataModel.metadata (static) called, usesSize:", metadata.usesSize);
            return metadata;
        }

        /** @type {ActorDataModelMetadata} */
        get metadata() {
            return this.constructor.metadata;
        }

        static defineSchema() {
            const fields = foundry.data.fields;
            return {
                ...super.defineSchema(),
                // Add Colossus-specific fields at top level
                conditionImmunities: new fields.SchemaField({
                    hidden: new fields.BooleanField({ initial: false }),
                    restrained: new fields.BooleanField({ initial: false }),
                    vulnerable: new fields.BooleanField({ initial: false })
                })
            };
        }

        /**
         * Helper to get segments from the actor's items.
         */
        get segments() {
            return this.parent.items.filter(i =>
                i.type === 'fb-cod.colossal-segment' ||
                i.type === 'colossal-segment'
            );
        }

        /** @inheritDoc */
        isItemValid(source) {
            return source.type === 'feature' ||
                source.type === 'fb-cod.colossal-segment' ||
                source.type === 'colossal-segment';
        }
    };
}
