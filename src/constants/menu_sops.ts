/** Optional SOP overrides keyed by exact dish name (see src/data/menu-sop-items.json). */
export const MENU_SOP_OVERRIDES: Record<
	string,
	{ steps: string[]; notes?: string }
> = {};
