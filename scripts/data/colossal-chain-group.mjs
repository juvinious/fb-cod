/**
 * Data Model for Colossal Chain Groups.
 * These groups are used to associate multiple segments together.
 * When all segments in a group are Destroyed, specific logic can be triggered.
 */
export function setupColossalChainGroupModel() {
    console.log("fb-cod | setupColossalChainGroupModel called");

    const BaseDataItem = game.system.api?.models?.items?.BaseDataItem || CONFIG.Item.dataModels.feature;

    return class ColossalChainGroupDataModel extends BaseDataItem {
        /** @type {ItemDataModelMetadata} */
        static get metadata() {
            return foundry.utils.mergeObject(super.metadata, {
                label: 'Colossal Chain Group',
                type: 'fb-cod.colossal-chain-group',
                hasDescription: true
            });
        }

        static defineSchema() {
            const fields = foundry.data.fields;
            const schema = super.defineSchema();

            // The mapped identifier for the chain group (e.g., 'A', 'B', 'C', 'U', or empty for Not Chained)
            schema.chainGroup = new fields.StringField({ required: true, blank: true, initial: "" });
            /** Segment types that this group targets (e.g. 'head', 'arm'). used for mapping. */
            schema.segmentTypes = new fields.ArrayField(new fields.StringField());

            /** The specific segment IDs that are part of this group. */
            schema.categories = new fields.ArrayField(new fields.StringField());
            // Whether this chain group contributes to fatality
            schema.fatal = new fields.BooleanField({ required: true, initial: true });
            // Optional subgroup identifier for template groupings
            schema.subgroup = new fields.StringField({ required: false, blank: true, initial: null, nullable: true });

            return schema;
        }
    };
}
