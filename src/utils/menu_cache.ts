import { TMenuApiItem } from '@/src/models/common';
import axios from 'axios';
import localforage from 'localforage';

export const MENU_CACHE_KEY = 'menu_api_items';

export async function getCachedMenuItems(): Promise<TMenuApiItem[] | null> {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const cached = await localforage.getItem<TMenuApiItem[]>(MENU_CACHE_KEY);
		return cached && cached.length > 0 ? cached : null;
	} catch (error) {
		console.error('Failed to read menu cache:', error);
		return null;
	}
}

export async function fetchAndCacheMenuItems(): Promise<TMenuApiItem[]> {
	const response = await axios.get<TMenuApiItem[]>('/api/menu', {
		headers: {
			'Cache-Control': 'no-cache',
			Pragma: 'no-cache',
		},
	});

	await localforage.setItem(MENU_CACHE_KEY, response.data);
	return response.data;
}
