"use client";

import {
	SERVICE_REQUEST_KIND_EMOJI,
	SERVICE_REQUEST_KIND_LABELS,
	ServiceRequestKind,
} from "@/src/models/service_requests";
import { getPendingCountForKind } from "@/src/utils/service_requests_utils";
import type { ServiceRequest } from "@/src/models/service_requests";

const KINDS: ServiceRequestKind[] = ["rice", "cutlery", "water"];

const KIND_CAPTIONS: Record<ServiceRequestKind, string> = {
	rice: "Rice",
	cutlery: "Cutlery",
	water: "Water",
};

type ServiceRequestStoriesProps = {
	requests: ServiceRequest[];
	onSelectKind: (kind: ServiceRequestKind) => void;
};

export function ServiceRequestStories({
	requests,
	onSelectKind,
}: ServiceRequestStoriesProps) {
	return (
		<div className="pointer-events-auto -mt-1 px-1">
			<div className="flex items-center justify-center gap-5 overflow-x-auto py-2 scrollbar-none">
				{KINDS.map((kind) => {
					const pending = getPendingCountForKind(requests, kind);
					const hasPending = pending > 0;
					return (
						<button
							key={kind}
							type="button"
							onClick={() => onSelectKind(kind)}
							className="flex flex-col items-center gap-1.5 shrink-0 touch-manipulation"
							aria-label={`${SERVICE_REQUEST_KIND_LABELS[kind]}${hasPending ? `, ${pending} pending` : ""}`}
						>
							<span
								className={`relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-2 bg-white shadow-md ${
									hasPending
										? "border-amber-500 ring-2 ring-amber-200"
										: "border-gray-200"
								}`}
							>
								<span
									className="text-[2.25rem] leading-none select-none"
									aria-hidden
								>
									{SERVICE_REQUEST_KIND_EMOJI[kind]}
								</span>
								{hasPending ? (
									<span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
										{pending > 99 ? "99+" : pending}
									</span>
								) : null}
							</span>
							<span className="rounded-full bg-white border border-gray-200/80 shadow-sm px-3 py-1 text-[11px] font-semibold text-gray-700">
								{KIND_CAPTIONS[kind]}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
