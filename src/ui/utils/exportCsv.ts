/**
 * src/ui/utils/exportCsv.ts
 * Shared utility to export any dataset to CSV with proper Arabic UTF-8 BOM encoding.
 */
export function exportToCsv<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  columns: Array<{ key: string; header: string; format?: (val: any, item: T) => string }>
): void {
  if (!rows || rows.length === 0) return;

  const separator = ',';
  const headers = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(separator);

  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = col.format ? col.format(row[col.key], row) : row[col.key];
        const str = val === undefined || val === null ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(separator)
  );

  // Prepend UTF-8 BOM (\uFEFF) so Excel displays Arabic characters cleanly
  const csvContent = '\uFEFF' + [headers, ...csvRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
