'use client';

import {
	ORDER_OPS_NEW_ORDERS_EVENT,
	OrderOpsNewOrdersDetail,
} from '@/src/models/order_ops';
import {
	playNewOrderBell,
	unlockOrderNotificationAudio,
} from '@/src/utils/order_notification_sound';
import { useEffect } from 'react';

export function OrderSyncNotificationListener() {
	useEffect(() => {
		const unlock = () => {
			unlockOrderNotificationAudio();
		};

		window.addEventListener('pointerdown', unlock);
		window.addEventListener('touchstart', unlock, { passive: true });
		window.addEventListener('keydown', unlock);

		const onNewOrders = (event: Event) => {
			const detail = (event as CustomEvent<OrderOpsNewOrdersDetail>).detail;
			if (!detail?.count) {
				return;
			}
			void playNewOrderBell();
		};

		window.addEventListener(ORDER_OPS_NEW_ORDERS_EVENT, onNewOrders);
		return () => {
			window.removeEventListener('pointerdown', unlock);
			window.removeEventListener('touchstart', unlock);
			window.removeEventListener('keydown', unlock);
			window.removeEventListener(ORDER_OPS_NEW_ORDERS_EVENT, onNewOrders);
		};
	}, []);

	return null;
}
