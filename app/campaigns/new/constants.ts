export const VENUE_GROUPS: Array<{ label: string; emoji: string; types: string[] }> = [
    {
        label: "Coffee & Tea",
        emoji: "☕",
        types: ["cafe", "coffeeshop", "tea_house"],
    },
    {
        label: "Bakery & Desserts",
        emoji: "🍞",
        types: ["bakery", "dessert_shop", "ice_cream"],
    },
    {
        label: "Restaurants",
        emoji: "🍽️",
        types: [
            "restaurant",
            "steakhouse",
            "seafood",
            "sushi",
            "mexican",
            "italian",
            "chinese",
            "indian",
            "thai",
        ],
    },
    {
        label: "Fast & Casual",
        emoji: "🍕",
        types: ["pizza", "fast_food", "deli", "juice_bar"],
    },
    {
        label: "Bars & Nightlife",
        emoji: "🍺",
        types: ["bar", "pub", "wine_bar", "brewery", "nightclub", "lounge", "cocktail_bar", "hookah_lounge"],
    },
    {
        label: "Entertainment & Activities",
        emoji: "🎯",
        types: ["arcade", "mini_golf", "bowling_alley", "snooker_hall", "pool_hall", "event_venue"],
    },
    {
        label: "Hospitality & Leisure",
        emoji: "🏨",
        types: ["hotel", "gym", "spa", "salon"],
    },
];

export interface RuleInput {
    venue_types: string[];
    min_rating_per_type: Record<string, number>;
    min_days_per_type: Record<string, number>;
    exclude_chains: boolean;
    exclude_keywords: string;
    custom_notes_per_type: Record<string, string>;
}

export const emptyRule: RuleInput = {
    venue_types: [],
    min_rating_per_type: {},
    min_days_per_type: {},
    exclude_chains: false,
    exclude_keywords: "",
    custom_notes_per_type: {},
};
