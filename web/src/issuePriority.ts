import { Ellipsis, SignalHigh, SignalLow, SignalMedium } from "lucide-react";

export const priorityIcons = new Map([
	["No priority", Ellipsis],
	["Low", SignalLow],
	["Medium", SignalMedium],
	["High", SignalHigh],
]);
