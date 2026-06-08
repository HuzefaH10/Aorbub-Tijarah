export const IMPORT_CONFIG = {
  maxFileSizeMB: null,               // null = no limit
  chunkSize: 500,                    // rows processed per batch
  supportedFormats: ['.csv', '.xlsx', '.xls'],
  maxRowsWarningThreshold: 10000,    // warn user but still allow
};
