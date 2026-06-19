"use client";

import { ItemCancelReason } from "@/src/models/common";
import { ITEM_CANCEL_REASONS } from "@/src/utils/item_cancel_reasons";
import { ConfirmModalActions } from "@/components/ui/touch-controls";
import { useState } from "react";

type CancelItemModalProps = {
	dishName: string;
	confirming?: boolean;
	onConfirm: (reason: ItemCancelReason) => void;
	onCancel: () => void;
};

export function CancelItemModal({
	dishName,
	confirming = false,
	onConfirm,
	onCancel,
}: CancelItemModalProps) {
	const [reason, setReason] = useState<ItemCancelReason>("customer_cancel");

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={() => {
				if (!confirming) {
					onCancel();
				}
			}}
		>
			<div
				className="w-full max-w-sm rounded-xl bg-white shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<h2 className="text-lg font-bold">Cancel item?</h2>
					<p className="text-sm text-gray-600 mt-2">
						Cancel <span className="font-semibold">{dishName}</span> and choose a
						reason.
					</p>
				</div>

				<div className="px-5 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
					{ITEM_CANCEL_REASONS.map((entry) => (
						<label
							key={entry.value}
							className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer touch-manipulation ${
								reason === entry.value
									? "border-red-400 bg-red-50"
									: "border-gray-200 bg-white"
							}`}
						>
							<input
								type="radio"
								name="cancel-reason"
								value={entry.value}
								checked={reason === entry.value}
								onChange={() => setReason(entry.value)}
								className="mt-1"
							/>
							<span className="text-sm font-medium text-gray-800">
								{entry.label}
							</span>
						</label>
					))}
				</div>

				<ConfirmModalActions
					onCancel={onCancel}
					onConfirm={() => onConfirm(reason)}
					confirmLabel="Cancel item"
					confirming={confirming}
					cancelDisabled={confirming}
				/>
			</div>
		</div>
	);
}
