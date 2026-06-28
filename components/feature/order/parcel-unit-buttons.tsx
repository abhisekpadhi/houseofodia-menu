type ParcelUnitButtonsProps = {
	itemName: string;
	qty: number;
	parcelUnits: boolean[];
	onToggle: (unitIndex: number) => void;
};

export function ParcelUnitButtons({
	itemName,
	qty,
	parcelUnits,
	onToggle,
}: ParcelUnitButtonsProps) {
	if (qty <= 0) {
		return null;
	}

	const normalizedUnits = resizeParcelUnits(parcelUnits, qty);

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mr-0.5">
				Parcel
			</span>
			{Array.from({ length: qty }, (_, unitIndex) => {
				const isParcel = normalizedUnits[unitIndex] === true;
				return (
					<button
						key={unitIndex}
						type="button"
						onClick={() => onToggle(unitIndex)}
						className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border touch-manipulation ${
							isParcel
								? "border-amber-400 bg-amber-200 text-amber-900 opacity-100 active:bg-amber-300"
								: "border-amber-200 bg-amber-50 text-amber-800 opacity-50 active:bg-amber-100"
						}`}
						aria-label={`${isParcel ? "Unmark" : "Mark"} ${itemName} unit ${unitIndex + 1} for parcel`}
						aria-pressed={isParcel}
					>
						<span className="text-base leading-none" aria-hidden>
							📦
						</span>
					</button>
				);
			})}
		</div>
	);
}

export function resizeParcelUnits(
	current: boolean[] | undefined,
	qty: number
): boolean[] {
	const existing = current ?? [];
	if (existing.length < qty) {
		return [
			...existing,
			...Array.from({ length: qty - existing.length }, () => false),
		];
	}
	return existing.slice(0, qty);
}
