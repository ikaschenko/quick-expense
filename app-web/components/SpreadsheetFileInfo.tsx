interface SpreadsheetFileInfoProps {
  spreadsheetUrl: string;
  fileName: string | null;
  isLoading: boolean;
}

export function SpreadsheetFileInfo({ spreadsheetUrl, fileName, isLoading }: SpreadsheetFileInfoProps): JSX.Element {
  if (isLoading) {
    return <span className="file-name-skeleton" aria-label="Loading file name…" />;
  }
  return (
    <a
      className="setup-connected-url-link"
      href={spreadsheetUrl}
      target="_blank"
      rel="noreferrer"
    >
      {fileName ?? spreadsheetUrl}
    </a>
  );
}
