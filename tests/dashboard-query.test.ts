import { describe, expect, it } from "vitest";
import { dashboardRoomIds } from "../src/lib/dashboard-query";

describe("dashboard-query", () => {
  it("utilise la residence active sans attendre la liste complete", () => {
    expect(dashboardRoomIds("acc-1", ["acc-2", "acc-3"])).toEqual(["acc-1"]);
  });

  it("attend les ids d'etablissements si aucune residence n'est active", () => {
    expect(dashboardRoomIds(null, ["acc-2", "acc-3"])).toEqual(["acc-2", "acc-3"]);
    expect(dashboardRoomIds(undefined, [])).toEqual([]);
  });
});
