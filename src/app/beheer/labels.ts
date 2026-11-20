/** Dutch labels for the logbook. Unknown actions show their raw key. */
const LABELS: Record<string, string> = {
  "beheer.ingelogd": "Ingelogd",
  "beheer.uitgelogd": "Uitgelogd",
  "instellingen.gewijzigd": "Instellingen gewijzigd",
  "familiecode.gewijzigd": "Familiecode gewijzigd",
  "pin.gewijzigd": "PIN gewijzigd",
};

export function actieLabel(action: string): string {
  return LABELS[action] ?? action;
}
