import { google, sheets_v4 } from "googleapis";
import type { SheetProvider } from "../core/interfaces";
import type { MatchedIssue, IssueStatus } from "../core/types";
import { determineIssueStatus } from "../core/matching";
import { APP_NAME } from "../constants";

const SHEET_TITLE = `${APP_NAME} Issues`;
const SHEET_NAME = "Issues";
const HEADERS = [
  "ID",
  "Repository",
  "Title",
  "URL",
  "Labels",
  "Languages",
  "Opened",
  "Added",
  "Status",
];

export class GoogleSheetProviderImpl implements SheetProvider {
  private getClient(accessToken: string): sheets_v4.Sheets {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.sheets({ version: "v4", auth });
  }

  async ensureSheet(userId: string, accessToken: string): Promise<string> {
    const sheets = this.getClient(accessToken);

    const response = await this.withRetry(() =>
      sheets.spreadsheets.create({
        requestBody: {
          properties: { title: SHEET_TITLE },
          sheets: [
            {
              properties: { title: SHEET_NAME },
            },
          ],
        },
      })
    );

    const spreadsheetId = response.data.spreadsheetId!;
    const sheetId = response.data.sheets?.[0]?.properties?.sheetId ?? 0;

    // Add headers
    await this.withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:I1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [HEADERS],
        },
      })
    );

    // Format header row (bold)
    await this.withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        },
      })
    );

    return spreadsheetId;
  }

  async appendIssues(
    spreadsheetId: string,
    issues: MatchedIssue[],
    accessToken: string
  ): Promise<Map<number, string>> {
    if (issues.length === 0) {
      return new Map();
    }

    const sheets = this.getClient(accessToken);
    const rowIdMap = new Map<number, string>();

    const rows = issues.map((issue) => {
      const rowId = `issue-${issue.id}`;
      rowIdMap.set(issue.id, rowId);

      return [
        rowId,
        `${issue.repo.owner}/${issue.repo.name}`,
        issue.title,
        issue.url,
        issue.labels.join(", "),
        issue.languages.join(", "),
        issue.createdAt.toISOString().split("T")[0],
        new Date().toISOString().split("T")[0],
        determineIssueStatus(issue),
      ];
    });

    await this.withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:I`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: rows,
        },
      })
    );

    return rowIdMap;
  }

  async updateStatuses(
    spreadsheetId: string,
    updates: Array<{ sheetRowId: string; status: IssueStatus }>,
    accessToken: string
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const sheets = this.getClient(accessToken);

    // Get all data to find row numbers by ID
    const response = await this.withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:I`,
      })
    );

    const rows = response.data.values || [];
    const updateMap = new Map(updates.map((u) => [u.sheetRowId, u.status]));

    const batchData: sheets_v4.Schema$ValueRange[] = [];

    for (let i = 1; i < rows.length; i++) {
      const rowId = rows[i][0];
      const newStatus = updateMap.get(rowId);

      if (newStatus) {
        batchData.push({
          range: `${SHEET_NAME}!I${i + 1}`,
          values: [[newStatus]],
        });
      }
    }

    if (batchData.length > 0) {
      await this.withRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "RAW",
            data: batchData,
          },
        })
      );
    }
  }

  async checkSheetExists(
    spreadsheetId: string,
    accessToken: string
  ): Promise<boolean> {
    const sheets = this.getClient(accessToken);

    try {
      await sheets.spreadsheets.get({ spreadsheetId });
      return true;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: number }).code === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;

        const isRateLimitError =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: number }).code === 429;

        if (isRateLimitError && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}
