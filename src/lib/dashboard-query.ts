export function dashboardRoomIds(
  activeAccommodationId?: string | null,
  accommodationIds: string[] = []
): string[] {
  if (activeAccommodationId) return [activeAccommodationId];
  return accommodationIds;
}
