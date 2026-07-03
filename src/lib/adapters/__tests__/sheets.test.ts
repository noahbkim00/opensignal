import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSheetProviderImpl } from "../sheets";

const googleMocks = vi.hoisted(() => ({
  create: vi.fn(),
  valuesUpdate: vi.fn(),
  batchUpdate: vi.fn(),
  sheetsFactory: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn();
      },
    },
    sheets: googleMocks.sheetsFactory,
  },
}));

describe("GoogleSheetProviderImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    googleMocks.create.mockResolvedValue({
      data: {
        spreadsheetId: "spreadsheet-1",
        sheets: [{ properties: { sheetId: 123 } }],
      },
    });
    googleMocks.valuesUpdate.mockResolvedValue({ data: {} });
    googleMocks.batchUpdate.mockResolvedValue({ data: {} });
    googleMocks.sheetsFactory.mockReturnValue({
      spreadsheets: {
        create: googleMocks.create,
        values: {
          update: googleMocks.valuesUpdate,
        },
        batchUpdate: googleMocks.batchUpdate,
      },
    });
  });

  it("creates spreadsheets named OpenSignal Issues", async () => {
    const provider = new GoogleSheetProviderImpl();

    await provider.ensureSheet("user-1", "access-token");

    expect(googleMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          properties: { title: "OpenSignal Issues" },
        }),
      })
    );
  });
});
