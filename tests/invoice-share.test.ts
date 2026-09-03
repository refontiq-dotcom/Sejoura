import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getInvoiceDownloadUrl } from "@/lib/invoice-share";

describe("getInvoiceDownloadUrl", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("retourne null si l'invoice n'a pas de token", () => {
    expect(getInvoiceDownloadUrl({ access_token: null })).toBeNull();
  });

  it("construit l'URL absolue à partir de NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.sejoura.com/";
    const url = getInvoiceDownloadUrl({ access_token: "abcd1234abcd1234abcd1234abcd1234abcd1234" });
    expect(url).toBe("https://app.sejoura.com/api/invoice/download/abcd1234abcd1234abcd1234abcd1234abcd1234");
  });

  it("accepte un origin passé en argument (fallback)", () => {
    const url = getInvoiceDownloadUrl(
      { access_token: "abcd1234abcd1234abcd1234abcd1234abcd1234" },
      "https://staging.sejoura.com"
    );
    expect(url).toBe("https://staging.sejoura.com/api/invoice/download/abcd1234abcd1234abcd1234abcd1234abcd1234");
  });

  it("retourne null si aucune origine n'est disponible", () => {
    expect(getInvoiceDownloadUrl({ access_token: "abcd1234abcd1234abcd1234abcd1234abcd1234" })).toBeNull();
  });
});
