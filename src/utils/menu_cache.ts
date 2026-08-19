import { TMenuApiItem } from '@/src/models/common';
import axios from 'axios';
import localforage from 'localforage';

export const MENU_CACHE_KEY = 'menu_api_items';

let memoryMenu: TMenuApiItem[] | null = null;
let inflightFetch: Promise<TMenuApiItem[]> | null = null;

export async function getCachedMenuItems(): Promise<TMenuApiItem[] | null> {
	if (typeof window === 'undefined') {
		return null;
	}

	if (memoryMenu && memoryMenu.length > 0) {
		return memoryMenu;
	}

	try {
		const cached = await localforage.getItem<TMenuApiItem[]>(MENU_CACHE_KEY);
		if (cached && cached.length > 0) {
			memoryMenu = cached;
			return cached;
		}
		return null;
	} catch (error) {
		console.error('Failed to read menu cache:', error);
		return null;
	}
}

export async function fetchAndCacheMenuItems(): Promise<TMenuApiItem[]> {
	if (inflightFetch) {
		return inflightFetch;
	}

	inflightFetch = (async () => {
		const response = await axios.get<TMenuApiItem[]>('/api/menu', {
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache',
			},
		});
		memoryMenu = response.data;
		await localforage.setItem(MENU_CACHE_KEY, response.data);
		return response.data;
	})().finally(() => {
		inflightFetch = null;
	});

	return inflightFetch;
}

/** Prefer memory/IndexedDB. Fetch Sheets only when cache is empty (or refresh in background). */
export async function getMenuItemsPreferCache(options?: {
	refresh?: boolean;
}): Promise<TMenuApiItem[]> {
	const cached = await getCachedMenuItems();
	if (cached) {
		if (options?.refresh) {
			void fetchAndCacheMenuItems();
		}
		return cached;
	}
	return fetchAndCacheMenuItems();
}
